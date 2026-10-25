# SnapShare: System Architecture & Scaling Plan

A comprehensive scaling and infrastructure design plan for **SnapShare**, a photo-sharing platform where users upload photos and browse a real-time feed of photos from accounts they follow.

---

## 1. Assumptions & Traffic Estimation

### Baseline Facts
- **Registered Users**: 10,000,000 (10 million).
- **Daily Active Users (DAU)**: 10% of registered users are active each day.
- **User Activity**:
  - Each active user uploads **1 photo per day**.
  - Each active user views **50 feed pages per day**.
- **Media Asset Sizes**:
  - Original photo: **2 MB**.
  - Thumbnail image: **50 KB** (0.05 MB).
- **Peak Traffic Multiplier**: **5×** average traffic load.
- **Time Window**: 1 day = 86,400 seconds; 1 year = 365 days.

### Calculations

#### Daily Active Users (DAU)
$$\text{DAU} = 10,000,000 \times 10\% = 1,000,000 \text{ active users/day (1 million DAU)}$$

#### Photo Uploads per Second (Write Traffic)
- **Total uploads per day**:
  $$1,000,000 \text{ active users} \times 1 \text{ photo/day} = 1,000,000 \text{ uploads/day}$$
- **Average uploads per second**:
  $$\frac{1,000,000 \text{ uploads}}{86,400 \text{ seconds}} \approx 11.57 \text{ uploads/sec} \approx 12 \text{ uploads/sec}$$
- **Peak uploads per second (5× multiplier)**:
  $$11.57 \times 5 \approx 57.87 \text{ uploads/sec} \approx 58 \text{ uploads/sec}$$

#### Feed Page Views per Second (Read Traffic)
- **Total feed views per day**:
  $$1,000,000 \text{ active users} \times 50 \text{ feed pages/day} = 50,000,000 \text{ feed views/day}$$
- **Average feed views per second**:
  $$\frac{50,000,000 \text{ views}}{86,400 \text{ seconds}} \approx 578.70 \text{ views/sec} \approx 579 \text{ views/sec}$$
- **Peak feed views per second (5× multiplier)**:
  $$578.70 \times 5 \approx 2,893.52 \text{ views/sec} \approx 2,894 \text{ views/sec}$$

#### Storage Requirements per Year
- **Total photos uploaded per year**:
  $$1,000,000 \text{ photos/day} \times 365 \text{ days} = 365,000,000 \text{ photos/year (365 million)}$$
- **Storage per photo (original + thumbnail)**:
  $$2.0 \text{ MB (original)} + 0.05 \text{ MB (thumbnail)} = 2.05 \text{ MB per uploaded photo}$$
- **Daily storage ingestion**:
  $$1,000,000 \text{ photos/day} \times 2.05 \text{ MB} = 2,050,000 \text{ MB/day} = 2,050 \text{ GB/day} = 2.05 \text{ TB/day}$$
  *(Originals: 2.0 TB/day; Thumbnails: 50 GB/day)*
- **Annual storage consumption**:
  $$2.05 \text{ TB/day} \times 365 \text{ days} = 748.25 \text{ TB/year} \approx 748 \text{ TB/year}$$
  *(Originals: 730 TB/year; Thumbnails: 18.25 TB/year)*

---

## 2. Read-Heavy vs. Write-Heavy Analysis

### System Ratio
- **Read Requests**: 50,000,000 feed page views/day (~579 avg / 2,894 peak req/sec).
- **Write Requests**: 1,000,000 photo uploads/day (~12 avg / 58 peak req/sec).
- **Read-to-Write Ratio**:
  $$\frac{50,000,000}{1,000,000} = 50:1$$

The system is overwhelmingly **read-heavy** ($50:1$). Considering that each feed view also fetches multiple image thumbnails, asset-level read traffic exceeds write traffic by several hundred to one.

### Architectural Implications
1. **Aggressive Multi-Tier Caching**: Since reading dominates system load, we must deploy a global CDN for static media (photos and thumbnails) and an in-memory cache (Redis) for feed data, active follower lists, and photo metadata to minimize origin hits.
2. **Read/Write Database Separation**: The database layer must separate writes from reads using a Primary-Replica (Leader-Follower) topology, where writes execute on the Primary database while read queries are load-balanced across multiple Read Replicas.
3. **Asynchronous Write Pipeline**: Because writes are lower in volume but involve heavier processing (resizing and metadata indexing), write operations must be handled asynchronously via background message queues so upload requests remain fast and responsive.

---

## 3. Storage Strategy: Why Binary Media Belongs Outside the Database

### Why Photos Should NOT Be Stored in the Database (BLOBs)
1. **Severe Database Bloat**: Ingesting ~748 TB of binary data annually would drastically expand database disk footprint, degrading page indexing performance and ballooning backup/restore times from hours to days.
2. **Buffer Pool & Memory Pollution**: Database memory (such as InnoDB buffer pool in MySQL or shared buffers in PostgreSQL) is optimized for caching frequently queried relational rows and B-tree indexes; storing 2 MB binary files exhausts RAM cache, flushing critical indexes from memory.
3. **Expensive Compute & Storage**: Relational databases require high-performance, block-attached SSD storage coupled with high CPU instances, making database storage 5× to 10× more expensive per gigabyte than distributed object stores.
4. **Connection Starvation**: Streaming multi-megabyte payloads through database connection pools keeps scarce, expensive database connection sockets open for extended durations, throttling high-throughput transactional queries.

### Where Photos Should Go Instead: Object Storage
Photos must be stored in a dedicated **Object Storage service** (such as Amazon S3, Google Cloud Storage, or self-hosted MinIO).
- The database stores only **structured metadata** (photo ID, user ID, upload timestamp, caption, and the object storage URLs / storage keys for both the original photo and its thumbnail).
- Object storage provides near-infinite horizontal scalability, 99.999999999% (11 9's) data durability, lifecycle management (infrequent access and cold archive tiers), and native integration with Content Delivery Networks.

---

## 4. System Architecture Diagram

```
                              [ User Clients / Mobile App ]
                                     /             \
                  Media Read (Images)               API Requests (Upload / Feed)
                                   /                 \
                                  v                   v
                     +-----------------------+   +-----------------------+
                     |          CDN          |   |     Load Balancer     |
                     | (Cloudflare/CloudFront|   |      (HAProxy/ALB)    |
                     +-----------------------+   +-----------------------+
                                 |                            |
                                 |               +------------+------------+
                                 |               |            |            |
                                 |               v            v            v
                                 |        +-----------------------------------+
                                 |        |        App Server Cluster         |
                                 |        |      (Stateless Node/Go/Python)   |
                                 |        +-----------------------------------+
                                 |             /            |            \
                                 |            /             |             \
                                 |           v              v              v
                                 |   +---------------+ +---------+ +---------------+
                                 |   | In-Memory     | | Primary | | Message Queue |
                                 |   | Cache (Redis) | | DB (SQL)| | (RabbitMQ/SQS)|
                                 |   +---------------+ +---------+ +---------------+
                                 |                          |              |
                                 |               Replication|              v
                                 |                          v      +---------------+
                                 |                     +---------+ |   Thumbnail   |
                                 |                     |  Read   | |    Worker     |
                                 |                     | Replica | +---------------+
                                 |                     +---------+         |
                                 v                                         v
                     +-------------------------------------------------------------+
                     |                        Object Storage                       |
                     |           (Amazon S3 / Google Cloud Storage)                |
                     |     - /photos/originals/       - /photos/thumbnails/        |
                     +-------------------------------------------------------------+
```

---

## 5. Component Responsibilities (One Sentence per Component)

1. **CDN (Content Delivery Network)**: Caches static photo and thumbnail files at geographically distributed edge points of presence (PoPs) to minimize download latency for end users and shield origin servers from massive media bandwidth.
2. **Load Balancer**: Distributes incoming HTTP/HTTPS traffic across healthy application server instances to prevent bottlenecks and provide seamless failover.
3. **App Servers**: Execute stateless business logic, validate uploads, authenticate users, assemble aggregated user feeds, and coordinate persistence across storage engines.
4. **Cache (Redis)**: Stores precomputed user feeds, session states, and hot photo metadata in memory to deliver sub-millisecond read responses and shield the database from repetitive queries.
5. **Primary Database (SQL)**: Handles all write transactions (such as user accounts, follow links, and new photo metadata) to ensure strict ACID guarantees and serve as the authoritative relational source of truth.
6. **Read Replica Database**: Serves read-only queries (such as profile lookups, follower lists, and historical post data) to horizontally scale query throughput and prevent connection saturation on the primary database.
7. **Object Storage (Amazon S3 / Cloud Storage)**: Provides highly durable, cost-effective, and horizontally scalable storage for unstructured binary photo files and generated thumbnails.
8. **Message Queue (RabbitMQ / SQS)**: Buffers and decouples compute-intensive background image processing tasks from the synchronous upload request path, ensuring immediate responsiveness for uploading users.
9. **Thumbnail Worker**: Consumes image processing jobs from the queue to resize original photos into 50 KB thumbnails and uploads them back to object storage.

---

## 6. Step-by-Step Photo Upload Flow

1. **Upload Request**: The user selects a photo on their mobile client and sends an HTTP `POST /api/photos` request with the photo file and caption metadata to the Load Balancer.
2. **Traffic Distribution & Auth**: The Load Balancer forwards the request to an available App Server, which authenticates the user's session token and validates the payload (e.g., verifying allowed MIME types like JPEG/PNG and file size $\le 2\text{ MB}$).
3. **Store Original Image**: The App Server uploads the 2 MB original photo stream directly to **Object Storage** under a unique key path (e.g., `photos/originals/{photo_id}.jpg`).
4. **Insert Metadata in Primary DB**: The App Server inserts a new record into the **Primary Database** containing the photo metadata (photo ID, user ID, caption, original photo URL/key, timestamp) and marks its status as `thumbnail_status: 'pending'`.
5. **Enqueue Thumbnail Generation Job**: The App Server publishes a message payload `{photo_id, original_photo_key}` onto the **Message Queue** and immediately responds to the client with an HTTP `201 Created` status code, freeing the client from waiting for image processing.
6. **Worker Picks Up Task**: An idle **Thumbnail Worker** pulls the message from the Message Queue, downloads the original 2 MB photo from Object Storage into memory, and generates an optimized 50 KB thumbnail.
7. **Upload Thumbnail & Update Records**: The Worker uploads the new thumbnail to Object Storage (`photos/thumbnails/{photo_id}.jpg`), updates the photo record in the Primary Database with the thumbnail URL, marks `thumbnail_status: 'ready'`, and sends an acknowledgment (`ACK`) to the queue.
8. **Feed Invalidation / Fan-out**: The App Server or background worker invalidates or updates the feed cache (in Redis) for the user's active followers so the new photo and thumbnail appear in their feeds on the next scroll.

---

## 7. Architectural Trade-offs

### Trade-off 1: Feed Generation Strategy — Fan-out-on-Write (Push) vs. Fan-out-on-Read (Pull)
- **Fan-out-on-Write (Push Model)**:
  - *Mechanism*: When a user uploads a photo, a background task immediately pushes the photo ID into the precomputed feed caches of all their followers in Redis.
  - *Pros*: Feed reads (`GET /feed`) are extremely fast ($O(1)$ lookup in memory), which aligns with our 50:1 read-heavy workload.
  - *Cons / Trade-off*: High write amplification when a celebrity or high-follower user posts; pushing one photo to 500,000 followers triggers 500,000 cache writes, overloading queues and cache memory.
- **Fan-out-on-Read (Pull Model)**:
  - *Mechanism*: The feed is dynamically generated when a user opens the app by querying followee IDs from the database and merging recent posts.
  - *Pros*: Zero write overhead on upload; inactive users consume no computational resources.
  - *Cons / Trade-off*: High read latency and expensive multi-table database joins during peak feed browsing (up to 2,894 views/second).
- **Design Decision**: Adopt a **hybrid model**. Standard users with $<25,000$ followers use fan-out-on-write into Redis, while accounts with high follower counts use fan-out-on-read, with their posts merged at query time into the follower's feed cache.

### Trade-off 2: Primary-Replica Eventual Consistency vs. Read-Your-Own-Writes Consistency
- **The Dilemma**:
  - Routing read queries to Read Replicas shields the Primary database and scales read capacity, but database replication is asynchronous.
  - As a result, replication lag (typically 10 to 500 ms) can occur between the Primary and Read Replicas.
- **The Trade-off**:
  - If a user uploads a photo and is immediately redirected to their own profile, a read from a lagging replica might fail to show the photo they literally just uploaded, causing confusion and repeated uploads.
- **Design Decision**: Implement **Read-Your-Own-Writes consistency**. The application directs general feed queries to the Read Replicas, but routes queries for a user's *own* newly created posts to the Primary database or serves them directly from a temporary local client cache for the first 5 seconds following an upload.
