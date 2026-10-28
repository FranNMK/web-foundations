# TicketHub: Scalable Event Ticketing System Design

A comprehensive system architecture and engineering design specification for **TicketHub**, a high-availability event ticketing platform engineered to handle everyday event discovery as well as high-concurrency flash sales for world-class concerts.

---

## 1. Requirements

### 1.1 Functional Requirements

1. **Event Discovery & Browsing**:
   - Users can search, filter, and view upcoming concerts and entertainment events by artist, venue, genre, and date.
   - Users can view detailed event metadata, seating charts, and ticket tier pricing.
2. **Interactive Seat Map & Real-Time Availability**:
   - Users can view an interactive visual seat map of the venue showing real-time seat states (`AVAILABLE`, `HELD`, `BOOKED`).
3. **Temporary Seat Holding (Cart Reservation)**:
   - Users can select up to 4 available seats and place a temporary **10-minute hold** on them.
   - During the 10-minute hold window, no other user can hold or purchase those specific seats.
4. **Checkout & Payment Processing**:
   - Users can securely enter payment details and purchase their held seats within the 10-minute expiration countdown.
   - Upon successful payment confirmation, the held seats transition permanently to `BOOKED`, and a binding order is created.
5. **Automatic Hold Expiration & Inventory Release**:
   - If the user cancels the reservation or the 10-minute countdown elapses without successful payment, the held seats are atomically released back to the `AVAILABLE` inventory pool.
6. **Ticket Delivery & Retrieval**:
   - Users can view their purchased orders and access digital tickets equipped with cryptographically verifiable QR codes for venue admission.

---

### 1.2 Non-Functional Requirements

- **Speed (Low Latency & High Throughput)**:
  - **Read Latency**: Event browsing and seat map lookups must achieve P95 latency $< 100\text{ ms}$ and P99 $< 200\text{ ms}$.
  - **Write Latency**: Seat hold requests must return within $< 250\text{ ms}$ under peak flash-sale loads.
  - **High Cache Hit Ratio**: $\ge 95\%$ of read traffic (event catalogs and static seat maps) served from edge CDN and in-memory caches to protect database systems.
- **Correctness (Zero Double-Booking & ACID Guarantees)**:
  - **Absolute Invariant**: Under no circumstance may two different users purchase or simultaneously hold the exact same seat (**Zero Double-Booking**).
  - All inventory status transitions must satisfy strict **ACID** properties (Atomicity, Consistency, Isolation, Durability) backed by database-level constraints and atomic conditional updates.
  - Financial transactions must be strictly idempotent using unique client idempotency tokens to prevent duplicate payment charges.
- **Fairness (First-Come, First-Served & Anti-Scalping)**:
  - Traffic bursts must be queued deterministically through a Virtual Waiting Room to guarantee that users who arrive first are served in order.
  - Strict purchase limits (maximum 4 seats per registered user per event) prevent bot syndicates and scalpers from hoarding ticket allocations.
  - Bot mitigation via Cloudflare Turnstile CAPTCHA and token-bucket API rate limiting at the edge layer.
- **High Availability & Fault Tolerance**:
  - System target availability of **99.99%** (less than 52.6 minutes of unscheduled downtime annually).
  - No Single Point of Failure (SPOF): Redundant multi-AZ load balancers, multi-replica database clusters with automated failover, and decoupled asynchronous worker queues.

---

## 2. Traffic & Capacity Estimations

### 2.1 Baseline Facts & Assumptions
- **Registered User Base**: 2,000,000 users.
- **Normal Day Operations**:
  - Daily Visitors: 50,000 unique visitors per day.
  - Browsing Depth: 10 page views per visitor.
  - Tickets Sold: 5,000 tickets sold per day.
- **Big Sale Peak (Hot Concert Flash Sale)**:
  - Total Available Inventory: 20,000 seats.
  - Traffic Window: First 10 minutes (600 seconds) of the on-sale event.
  - Concurrent Competing Users: 200,000 users actively attempting to buy seats within those 10 minutes.

---

### 2.2 Normal Day Traffic Calculations

#### Read Traffic (Browsing & Page Views)
$$\text{Total Daily Page Views} = 50,000 \text{ visitors} \times 10 \text{ pages/visitor} = 500,000 \text{ page views/day}$$

$$\text{Average Read RPS} = \frac{500,000 \text{ views}}{86,400 \text{ seconds}} \approx 5.79 \text{ req/sec} \approx 6 \text{ RPS}$$

$$\text{Normal Peak Read RPS (3}\times\text{ multiplier)} = 5.79 \times 3 \approx 17.4 \text{ req/sec} \approx 18 \text{ RPS}$$

#### Write Traffic (Ticket Sales & Holds)
$$\text{Average Sales per Day} = 5,000 \text{ tickets/day}$$

$$\text{Average Write TPS} = \frac{5,000 \text{ sales}}{86,400 \text{ seconds}} \approx 0.058 \text{ transactions/sec}$$
*(Approximately 1 ticket transaction every 17.3 seconds)*

$$\text{Normal Peak Write TPS (3}\times\text{ multiplier)} = 0.058 \times 3 \approx 0.174 \text{ transactions/sec}$$

---

### 2.3 "Big Sale" Peak Calculations (Flash Sale)

During the first 10 minutes ($600\text{ seconds}$), **200,000 people** compete for **20,000 seats**.

#### Read & Interactive Ingestion Traffic
- Each active user aggressively refreshes event details, fetches seat layouts, polls hold status, and navigates the checkout funnel (averaging $\sim 20$ HTTP requests per user over 10 minutes):
$$\text{Total Flash Sale Requests} = 200,000 \text{ users} \times 20 \text{ requests} = 4,000,000 \text{ requests}$$

$$\text{Average Flash Sale Read RPS} = \frac{4,000,000 \text{ requests}}{600 \text{ seconds}} \approx 6,666.67 \text{ req/sec} \approx 6,667 \text{ RPS}$$

- **Burst Factor**: Within the first 60 seconds of ticket drop, traffic spikes to at least $2\times$ the 10-minute average:
$$\text{Peak Burst Read RPS} = 6,667 \times 2 \approx 13,334 \text{ RPS}$$

#### Write & Reservation Traffic (Holds & Bookings)
- **Hold Request Attempts**: All 200,000 users attempt to lock seats within the 600-second window:
$$\text{Average Hold Attempt Rate} = \frac{200,000 \text{ hold attempts}}{600 \text{ seconds}} \approx 333.33 \text{ hold req/sec}$$
$$\text{Peak Initial Hold Burst (First 30 seconds)} \approx 1,500 - 2,000 \text{ hold req/sec}$$

- **Final Completed Ticket Purchases**: All 20,000 seats sell out completely during the 10-minute window:
$$\text{Completed Sales Rate} = \frac{20,000 \text{ seats}}{600 \text{ seconds}} \approx 33.33 \text{ completed sales/sec}$$

---

### 2.4 Traffic Comparison & Scalability Gap

| Metric | Normal Day Average | Normal Day Peak | Big Sale Flash Average | Big Sale Flash Peak | Scale Surge Factor |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Active Concurrent Users** | $\sim 500$ users | $\sim 1,500$ users | $200,000$ users | $200,000+$ users | **$\approx 133\times$ to $400\times$** |
| **Read Throughput** | $5.79\text{ RPS}$ | $18\text{ RPS}$ | $6,667\text{ RPS}$ | $13,334\text{ RPS}$ | **$\approx 1,151\times$** |
| **Hold Request Attempts** | $\approx 0.1\text{ req/s}$ | $\approx 0.35\text{ req/s}$ | $333.3\text{ req/s}$ | $1,500 - 2,000\text{ req/s}$ | **$\approx 3,333\times$ to $5,700\times$** |
| **Sales Completion Rate** | $0.058\text{ sales/s}$ | $0.174\text{ sales/s}$ | $33.3\text{ sales/s}$ | $60+\text{ sales/s}$ | **$\approx 574\times$** |
| **Inventory Contention** | Low ($\ll 1$ user/seat) | Low | Extreme (**$10$ users per seat**) | Violent initial lock race | **Critical contention** |

#### Analytical Insights:
1. **The Contention Bottleneck**: Under normal conditions, requests distribute uniformly across dozens of events and thousands of disjoint seats with zero lock collisions. During the big sale, 200,000 users simultaneously focus their attention on the **same single event** and compete for the **same 20,000 rows**.
2. **Database Vulnerability**: A direct hit of $13,300+\text{ RPS}$ and thousands of concurrent database write transactions would exhaust connection pools, produce catastrophic lock wait timeouts, and crash an unprepared relational database.
3. **Architectural Mandate**: The system requires a **Virtual Waiting Room** to throttle concurrency, an **in-memory distributed lock layer (Redis)** to handle hold contention, and **multi-level edge caching** to insulate the primary transactional database.

---

## 3. RESTful API Design

The TicketHub API adheres strictly to REST principles, utilizing standard HTTP verbs, JSON request/response payloads, and descriptive HTTP response status codes.

```
Base URL: https://api.tickethub.com/api/v1
Authentication: Bearer <JWT_TOKEN>
```

---

### Endpoint 1: Browse Events
Retrieves a paginated list of published events with optional filtering by query keyword, genre, and date window.

- **Method**: `GET`
- **Path**: `/events`
- **Query Parameters**:
  - `query` (string, optional): Search keyword (e.g., `Coldplay`).
  - `genre` (string, optional): Genre filter (e.g., `Rock`, `Pop`).
  - `from_date` (ISO-8601 string, optional): Filter start date (`2026-11-01`).
  - `page` (integer, default: 1): Page number.
  - `limit` (integer, default: 20, max: 100): Results per page.
- **Headers**:
  - `Accept: application/json`

#### Response: `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "evt_9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "title": "Coldplay: Music of the Spheres World Tour",
      "genre": "Rock",
      "venue": {
        "name": "Wembley Stadium",
        "city": "London",
        "country": "UK",
        "capacity": 20000
      },
      "event_date": "2026-11-15T19:30:00Z",
      "sale_start_time": "2026-10-30T10:00:00Z",
      "ticket_price_range": {
        "currency": "USD",
        "min_cents": 6500,
        "max_cents": 25000
      },
      "status": "ON_SALE"
    }
  ],
  "pagination": {
    "current_page": 1,
    "per_page": 20,
    "total_records": 1,
    "total_pages": 1
  }
}
```

---

### Endpoint 2: View Event Seat Map & Availability
Retrieves the seating layout and real-time seat availability for an event.

- **Method**: `GET`
- **Path**: `/events/{eventId}/seats`
- **Query Parameters**:
  - `section` (string, optional): Filter by venue section (e.g., `A1`, `VIP`).
  - `status` (string, optional): Filter by seat status (`AVAILABLE`, `HELD`, `BOOKED`).
- **Headers**:
  - `Accept: application/json`

#### Response: `200 OK`
```json
{
  "success": true,
  "event_id": "evt_9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "total_seats": 20000,
  "available_seats_count": 8420,
  "seats": [
    {
      "seat_id": "seat_4a1e948f-3950-4827-8d02-a1b73e5f0110",
      "section": "A1",
      "row": "12",
      "seat_number": "14",
      "price_cents": 12000,
      "currency": "USD",
      "status": "AVAILABLE"
    },
    {
      "seat_id": "seat_4a1e948f-3950-4827-8d02-a1b73e5f0111",
      "section": "A1",
      "row": "12",
      "seat_number": "15",
      "price_cents": 12000,
      "currency": "USD",
      "status": "HELD"
    }
  ]
}
```

---

### Endpoint 3: Temporary Seat Hold (Cart Reservation)
Places an atomic 10-minute hold on selected seats for the authenticated user.

- **Method**: `POST`
- **Path**: `/events/{eventId}/holds`
- **Headers**:
  - `Authorization: Bearer <JWT_TOKEN>`
  - `Content-Type: application/json`
  - `Idempotency-Key: <UUID>`

#### Request Body:
```json
{
  "seat_ids": [
    "seat_4a1e948f-3950-4827-8d02-a1b73e5f0110",
    "seat_4a1e948f-3950-4827-8d02-a1b73e5f0112"
  ]
}
```

#### Response: `201 Created`
```json
{
  "success": true,
  "hold_id": "hld_7c8d9e0f-1a2b-4c3d-9e8f-0a1b2c3d4e5f",
  "event_id": "evt_9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "user_id": "usr_10293847-5647-4839-2019-aabbccddeeff",
  "held_seat_ids": [
    "seat_4a1e948f-3950-4827-8d02-a1b73e5f0110",
    "seat_4a1e948f-3950-4827-8d02-a1b73e5f0112"
  ],
  "total_price_cents": 24000,
  "currency": "USD",
  "hold_duration_seconds": 600,
  "expires_at": "2026-10-30T10:10:00Z"
}
```

#### Error Response: `409 Conflict` (Seat already held or booked)
```json
{
  "success": false,
  "error": {
    "code": "SEAT_UNAVAILABLE",
    "message": "One or more requested seats are no longer available.",
    "conflicted_seats": [
      "seat_4a1e948f-3950-4827-8d02-a1b73e5f0110"
    ]
  }
}
```

---

### Endpoint 4: Submit Payment & Complete Purchase
Validates the hold, executes payment through payment gateway, and books seats permanently.

- **Method**: `POST`
- **Path**: `/orders/checkout`
- **Headers**:
  - `Authorization: Bearer <JWT_TOKEN>`
  - `Content-Type: application/json`
  - `Idempotency-Key: <UNIQUE_CHECKOUT_UUID>`

#### Request Body:
```json
{
  "hold_id": "hld_7c8d9e0f-1a2b-4c3d-9e8f-0a1b2c3d4e5f",
  "payment_method": {
    "gateway": "STRIPE",
    "payment_token": "pm_tok_1N8h7t2eZvKYlo2CL9Y82xLq"
  },
  "billing_details": {
    "name": "Francis N.",
    "email": "frankmk2025@gmail.com"
  }
}
```

#### Response: `201 Created`
```json
{
  "success": true,
  "order_id": "ord_88192031-4829-4112-9920-112233445566",
  "order_number": "TH-20261030-99281",
  "status": "PAID",
  "event_id": "evt_9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "event_title": "Coldplay: Music of the Spheres World Tour",
  "total_amount_cents": 24000,
  "currency": "USD",
  "paid_at": "2026-10-30T10:04:12Z",
  "tickets": [
    {
      "ticket_id": "tkt_11223344-5566-7788-99aa-bbccddeeff00",
      "seat_id": "seat_4a1e948f-3950-4827-8d02-a1b73e5f0110",
      "section": "A1",
      "row": "12",
      "seat_number": "14"
    },
    {
      "ticket_id": "tkt_11223344-5566-7788-99aa-bbccddeeff01",
      "seat_id": "seat_4a1e948f-3950-4827-8d02-a1b73e5f0112",
      "section": "A1",
      "row": "12",
      "seat_number": "16"
    }
  ]
}
```

#### Error Response: `410 Gone` (Hold expired prior to checkout completion)
```json
{
  "success": false,
  "error": {
    "code": "HOLD_EXPIRED",
    "message": "Your 10-minute hold window has expired. Seats have been returned to the public pool."
  }
}
```

---

### Endpoint 5: View Purchased Orders & Tickets
Retrieves confirmed order receipts along with ticket admission barcodes/QR codes.

- **Method**: `GET`
- **Path**: `/orders/{orderId}`
- **Headers**:
  - `Authorization: Bearer <JWT_TOKEN>`
  - `Accept: application/json`

#### Response: `200 OK`
```json
{
  "success": true,
  "order": {
    "order_id": "ord_88192031-4829-4112-9920-112233445566",
    "order_number": "TH-20261030-99281",
    "status": "PAID",
    "purchased_at": "2026-10-30T10:04:12Z",
    "total_amount_cents": 24000,
    "currency": "USD",
    "event": {
      "id": "evt_9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "title": "Coldplay: Music of the Spheres World Tour",
      "venue": "Wembley Stadium, London",
      "event_date": "2026-11-15T19:30:00Z"
    },
    "tickets": [
      {
        "ticket_id": "tkt_11223344-5566-7788-99aa-bbccddeeff00",
        "seat": {
          "section": "A1",
          "row": "12",
          "seat_number": "14"
        },
        "attendee_name": "Francis N.",
        "qr_code_payload": "https://verify.tickethub.com/tkt/e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "validation_code": "TH-WEM-A1-1214"
      }
    ]
  }
}
```

---

## 4. Data Model

The data layer uses an ACID-compliant Relational Database Management System (**PostgreSQL**). A relational model is essential because ticketing mandates strict transactional integrity, foreign key referential consistency, and row-level uniqueness constraints.

---

### 4.1 Schema Definition & DDL

```sql
-- 1. Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    phone_number VARCHAR(30),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Events Table
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    venue_name VARCHAR(200) NOT NULL,
    venue_city VARCHAR(100) NOT NULL,
    total_seats INT NOT NULL CHECK (total_seats > 0),
    event_date TIMESTAMP WITH TIME ZONE NOT NULL,
    sale_start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED', -- 'SCHEDULED', 'ON_SALE', 'SOLD_OUT', 'COMPLETED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Seats Table
CREATE TABLE seats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    section VARCHAR(30) NOT NULL,
    row_num VARCHAR(10) NOT NULL,
    seat_num VARCHAR(10) NOT NULL,
    price_cents INT NOT NULL CHECK (price_cents >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE', -- 'AVAILABLE', 'HELD', 'BOOKED'
    held_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    hold_expires_at TIMESTAMP WITH TIME ZONE,
    version INT NOT NULL DEFAULT 0, -- For Optimistic Concurrency Control
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Invariant: A physical seat cannot be registered twice for the same event
    CONSTRAINT uq_event_section_row_seat UNIQUE (event_id, section, row_num, seat_num)
);

-- 4. Orders Table
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(64) NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    total_amount_cents INT NOT NULL CHECK (total_amount_cents >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'PAID', 'CANCELLED', 'REFUNDED'
    payment_reference VARCHAR(150),
    idempotency_key VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP WITH TIME ZONE
);

-- 5. Tickets Table (Associative Entity: Orders to Seats)
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    seat_id UUID NOT NULL REFERENCES seats(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    qr_code_hash VARCHAR(255) NOT NULL UNIQUE,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Invariant: A physical seat can belong to at most ONE issued ticket
    CONSTRAINT uq_seat_ticket UNIQUE (seat_id)
);
```

---

### 4.2 Entity Relationships

```
+---------------+              1 : N             +---------------+
|     users     | -----------------------------> |    orders     |
+---------------+                                +---------------+
  |           |                                    |           |
  | 1:N       | 1:N (held seats)                   | 1:N       |
  v           v                                    v           |
+---------------+                                +---------------+     1 : 1
|    tickets    | <----------------------------- |    tickets    | ------------> [ seats ]
+---------------+                                +---------------+
                                                   |
+---------------+              1 : N               |
|    events     | ---------------------------------+
+---------------+
  |
  | 1:N
  v
+---------------+
|     seats     |
+---------------+
```

- **`users` to `orders` ($1 : N$)**: One registered user can place multiple ticket orders over time.
- **`events` to `seats` ($1 : N$)**: One event contains thousands of distinct physical seats (e.g., 20,000 for a stadium concert).
- **`orders` to `tickets` ($1 : N$)**: One checkout order contains one or multiple tickets (up to the 4-ticket purchase cap).
- **`seats` to `tickets` ($1 : 1$ Unique Constraint)**: Each seat can belong to at most **one** ticket record. This constraint is physically enforced at the database level by `CONSTRAINT uq_seat_ticket UNIQUE (seat_id)`.
- **`users` to `seats` ($1 : N$ temporary hold)**: A user holds up to 4 seats concurrently via the `held_by_user_id` foreign key.

---

### 4.3 Production Indexes & Performance Tuning

1. **`CREATE INDEX idx_seats_event_status ON seats(event_id, status);`**
   - **Justification**: Accelerates the interactive seat map query (`GET /events/{id}/seats?status=AVAILABLE`). Allows the database engine to perform an index range scan to fetch all available seats in sub-millisecond time rather than performing an $O(N)$ sequential scan across all 20,000 seats.
2. **`CREATE INDEX idx_seats_hold_expiry ON seats(hold_expires_at) WHERE status = 'HELD';`**
   - **Justification**: A partial index dedicated to the background Hold Expiration Worker. Every few seconds, the worker scans for abandoned holds:
     `SELECT id FROM seats WHERE status = 'HELD' AND hold_expires_at <= NOW();`
     The partial index keeps index size tiny and lookups instantaneous.
3. **`CREATE INDEX idx_orders_user_id ON orders(user_id, created_at DESC);`**
   - **Justification**: Powers the customer order history dashboard (`GET /orders`) sorted chronologically.

---

## 5. Architecture Diagram & Big Sale Survival Strategy

### 5.1 Architecture Diagram

```
                                      [ 200,000 Flash Sale Clients ]
                                                     |
                                                     v
                                  +------------------------------------+
                                  |   DNS Anycast + DDoS Mitigation   |
                                  |      (Cloudflare / AWS Route53)    |
                                  +------------------------------------+
                                                     |
                                                     v
                                  +------------------------------------+
                                  |        Virtual Waiting Room        |
                                  |   (Queue-IT / Cloudflare Queue)    |
                                  |  - Token Bucket Fair Queuing       |
                                  |  - Smooths 13.3k RPS down to 2k RPS|
                                  +------------------------------------+
                                                     |
                                                     v
                                  +------------------------------------+
                                  |    Edge CDN & Static Asset Cache   |
                                  |  - Venue layouts, JS/CSS bundles   |
                                  +------------------------------------+
                                                     |
                                                     v
                                  +------------------------------------+
                                  |      Application Load Balancer     |
                                  |       (HAProxy / AWS ALB)          |
                                  +------------------------------------+
                                                     |
                                    +----------------+---------------+
                                    |                |               |
                                    v                v               v
                           +-------------------------------------------------+
                           |        Stateless App Servers (Node.js/Go)       |
                           |   Auto-Scaling Cluster (Kubernetes / ECS)       |
                           +-------------------------------------------------+
                                    |                |               |
               +--------------------+                |               +--------------------+
               |                                     |                                    |
               v                                     v                                    v
     +-------------------+                 +-------------------+                +-------------------+
     |   Redis Cluster   |                 | PgBouncer Pooler  |                |   Message Queue   |
     | - Distributed Lock|                 +-------------------+                | (RabbitMQ / SQS)  |
     | - Seat Hold Cache |                           |                          +-------------------+
     | - Fast Availability|                          v                                    |
     +-------------------+                 +-------------------+                          v
                                           |  PostgreSQL Main  |                +-------------------+
                                           | (Primary - Writes)|                | Asynchronous      |
                                           +-------------------+                | Worker Cluster    |
                                                     |                          | - Payment Webhooks|
                                          Replication| (Streaming)              | - PDF/QR Tickets  |
                                                     v                          | - Email Confirm   |
                                           +-------------------+                | - Hold Janitor    |
                                           |  PostgreSQL Read  |                +-------------------+
                                           |  Replica Cluster  |
                                           +-------------------+
```

---

### 5.2 Component Breakdown & Responsibilities

1. **DNS & DDoS Protection (Route 53 / Cloudflare)**:
   - Resolves global user traffic, filters volumetric layer 3/4 DDoS attacks, and provides geo-routing.
2. **Virtual Waiting Room (Queue-IT / Edge Token Queue)**:
   - Intercepts the massive 200,000-user traffic surge at the edge before it touches backend infrastructure.
   - Assigns users an immutable, cryptographically signed FIFO position token and throttles admissions down to a calibrated rate (e.g., 2,000 active users admitted per minute), preventing origin server collapse.
3. **Edge CDN (CloudFront / Fastly)**:
   - Caches static venue seating diagrams, high-resolution stage schematics, CSS, and JavaScript bundles. Offloads over 90% of static bandwidth away from application servers.
4. **Application Load Balancer (ALB / HAProxy)**:
   - Distributes incoming HTTPS traffic across healthy backend application nodes using round-robin and least-connections algorithms; performs SSL termination and health-checking.
5. **Stateless App Servers (Auto-scaling Go/Node.js Cluster)**:
   - Executes core business logic: authenticating tokens, verifying queue pass legitimacy, executing seat reservation transactions, and coordinating checkout workflows. Statelessness allows the cluster to scale from 10 nodes to 80+ nodes automatically.
6. **In-Memory Cache & Distributed Lock Layer (Redis Cluster)**:
   - Maintains real-time seat availability bitmaps.
   - Executes atomic seat hold checks in sub-millisecond memory using Lua scripts before hitting PostgreSQL, filtering out redundant reservation attempts when a seat is already held.
7. **Database Connection Pooler (PgBouncer)**:
   - Sits directly in front of PostgreSQL to pool and multiplex database connections, preventing connection exhaustion when hundreds of app server threads execute concurrent queries.
8. **Primary PostgreSQL Database (Write Master)**:
   - Single authoritative source of truth enforcing ACID transactions, row-level locks, foreign keys, and unique constraints.
9. **PostgreSQL Read Replicas**:
   - Asynchronously replicated read nodes servicing read-heavy catalog searches, historical user order lookups, and seat status queries.
10. **Message Queue (RabbitMQ / AWS SQS)**:
    - Buffers non-blocking post-checkout tasks: invoice PDF generation, ticket QR code cryptographic signing, push notifications, and email delivery.
11. **Asynchronous Background Workers**:
    - **Hold Janitor Service**: Scans and cleans up expired holds every 5 seconds.
    - **Fulfillment Worker**: Consumes checkout events to generate barcode assets and dispatch customer confirmation emails.

---

### 5.3 Surviving the Big Sale: Multi-Stage Shock Absorption

When 200,000 fans rush to buy 20,000 seats at 10:00 AM, the system survives through five defense tiers:

1. **Traffic Shaving via Virtual Waiting Room**:
   - The 200,000 users are placed in a waiting room before 10:00 AM.
   - At 10:00 AM, they receive randomized queue positions to prevent automated bot scripts from claiming early slots.
   - The gateway admits users into the ticketing application at a metered rate of **500 users every 15 seconds**, smoothing the $13,300\text{ RPS}$ peak down to a steady, manageable $1,500 - 2,000\text{ RPS}$.
2. **Read Offloading via Multi-Tier Caching**:
   - Event metadata, venue layout, and pricing are cached at the CDN edge with short TTLs (5–10 seconds) with `stale-while-revalidate` directives.
   - Redis caches the dynamic seating chart bitmap, serving seat availability directly from memory in $< 2\text{ ms}$.
3. **Database Connection Shielding via PgBouncer**:
   - App servers connect to PgBouncer in transaction-pooling mode. Instead of opening 2,000 direct database connections, PgBouncer multiplexes traffic across a lean pool of 64 dedicated database connections, eliminating context-switching thrashing on the database CPU.
4. **Row-Level Atomic Locking & Concurrency Control**:
   - Eliminates distributed lock synchronization pitfalls by delegating final seat acquisition to PostgreSQL row-level locks within an explicit ACID transaction.
5. **Decoupled Asynchronous Checkout Completion**:
   - The critical synchronous path handles only hold verification, credit card authorization, and row updates (`status = 'BOOKED'`).
   - Generating PDF tickets, signing QR codes, and sending emails are pushed to the background message queue, keeping checkout response latency $< 300\text{ ms}$.

---

## 6. How Double-Booking is Prevented

The core technical challenge in ticketing is ensuring that **two people can never buy or hold the same seat**, even when requests arrive at the exact same millisecond. TicketHub prevents double-booking using a **four-layer defense-in-depth model**.

---

### Layer 1: Database-Level Unique Constraints (The Hard Stop)
The database enforces uniqueness constraints at the relational schema layer:
```sql
CONSTRAINT uq_seat_ticket UNIQUE (seat_id)
```
Even if an application-level bug or network retry occurs, the relational database engine guarantees that two separate rows in `tickets` can **never** point to the same `seat_id`. Any concurrent second attempt to insert a ticket for that seat triggers a `23505 Unique Violation` database error, aborting the transaction immediately.

---

### Layer 2: Atomic Conditional SQL UPDATE (Pessimistic Row-Level Locking)
When a user requests a hold on a seat, the application does **not** perform an unsafe `SELECT` followed by an `UPDATE` in separate queries (which creates a classic *Time-Of-Check to Time-Of-Use* / TOCTOU race condition).

Instead, the seat hold is acquired through an **atomic conditional UPDATE statement**:

```sql
UPDATE seats
SET status = 'HELD',
    held_by_user_id = :userId,
    hold_expires_at = NOW() + INTERVAL '10 minutes',
    version = version + 1
WHERE id = :seatId
  AND (
      status = 'AVAILABLE'
      OR (status = 'HELD' AND hold_expires_at < NOW())
  );
```

#### How the Database Engine Executes This:
1. When two concurrent transactions ($T_1$ and $T_2$) attempt to hold the same seat at the identical millisecond, the database's storage engine (e.g., PostgreSQL MVCC with row locks) places an **exclusive row-level write lock** on the target row for the first transaction that reaches the engine ($T_1$).
2. $T_1$ evaluates the `WHERE` clause: `status` is `'AVAILABLE'`. The predicate evaluates to `TRUE`.
3. $T_1$ modifies the row (`status = 'HELD'`, `held_by_user_id = User1`), increments `version`, and commits its transaction, releasing the row lock.
4. $T_2$ (which was queued waiting for the lock) now reads the freshly committed row state.
5. $T_2$ evaluates its `WHERE` clause: `status` is now `'HELD'` and `hold_expires_at` is in the future. The predicate evaluates to `FALSE`.
6. The database updates **0 rows** for $T_2$.
7. The application detects `rows_affected == 0`, rolls back any temporary state, and immediately returns an HTTP `409 Conflict` to the second user with the message: `"Seat is no longer available"`.

---

### Layer 3: ACID Transaction Isolation During Checkout
When the user submits payment for held seats, the checkout logic runs inside an ACID transaction with strict isolation:

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;

-- Step 1: Lock and verify the held seats belong to this user and hold hasn't expired
SELECT id, price_cents
FROM seats
WHERE id = :seatId
  AND status = 'HELD'
  AND held_by_user_id = :userId
  AND hold_expires_at > NOW()
FOR UPDATE;

-- (If 0 rows returned, hold has expired or was stolen; abort and rollback)

-- Step 2: Create the Order record
INSERT INTO orders (id, order_number, user_id, event_id, total_amount_cents, status, idempotency_key)
VALUES (:orderId, :orderNumber, :userId, :eventId, :totalAmount, 'PAID', :idempotencyKey);

-- Step 3: Insert the Tickets
INSERT INTO tickets (order_id, seat_id, user_id, qr_code_hash)
VALUES (:orderId, :seatId, :userId, :qrHash);

-- Step 4: Finalize seat status to BOOKED and clear temporary hold metadata
UPDATE seats
SET status = 'BOOKED',
    held_by_user_id = NULL,
    hold_expires_at = NULL,
    version = version + 1
WHERE id = :seatId;

COMMIT;
```

- **`FOR UPDATE` locking**: Guarantees that while payment confirmation executes, no background expiration process can reassign or alter the seat.
- **Idempotency Keys**: The `idempotency_key` constraint on `orders` ensures that network retries or double-clicking the payment button does not create duplicate orders or double-charge the credit card.

---

### Layer 4: Automated Hold Expiration & Background Janitor
To ensure seats held by users who abandon checkout are returned to inventory:
1. **Application Check**: Any subsequent hold request checks `(status = 'HELD' AND hold_expires_at < NOW())`. If the hold timestamp has passed, the row is eligible for instant overwrite by the next buyer.
2. **Background Janitor Worker**: A lightweight worker queries the database every 5 seconds using the partial index:
   ```sql
   UPDATE seats
   SET status = 'AVAILABLE',
       held_by_user_id = NULL,
       hold_expires_at = NULL
   WHERE status = 'HELD'
     AND hold_expires_at < NOW();
   ```
   This immediately broadcasts updated availability to the Redis cache and WebSocket channels so waiting fans see newly freed seats in real time.

---

## 7. Trade-offs & Engineering Decisions

### Trade-off 1: Virtual Waiting Room vs. Instant Direct Access
- **Decision**: Implement a mandatory Virtual Waiting Room (Edge Queue) during high-demand concert drops.
- **Advantages**:
  - **System Stability**: Transforms an uncontrollable, spiky Poisson distribution of 13,000+ RPS into a smooth, deterministic stream of 2,000 RPS, preventing database thrashing and cascading outages.
  - **Fairness**: Enforces a strict first-come, first-served admission model while neutralizing high-frequency automated bot scripts.
- **Disadvantages / Costs**:
  - **User Experience Friction**: Legitimate users must wait in line and stare at a progress bar rather than immediately accessing the seat selection view.
  - **Infrastructure Complexity**: Requires managing queue token states, edge cookies, and handling users whose network connections drop while queued.

---

### Trade-off 2: Pessimistic Row-Level SQL Locking vs. Pure In-Memory Redis Locking
- **Decision**: Use PostgreSQL atomic row-level locks as the definitive source of truth, complemented by Redis as an auxiliary read filter.
- **Advantages**:
  - **Absolute Correctness**: Relational database transactions guarantee full ACID properties and mathematical impossibility of double-booking, which is essential to avoid catastrophic financial liabilities and PR disasters.
  - **Data Durability**: Write-Ahead Logging (WAL) ensures seat states survive unexpected hardware crashes or container restarts.
- **Disadvantages / Costs**:
  - **Lower Peak Throughput**: Database row-level locks require disk-backed synchronization and have higher latency ($\sim 15 - 30\text{ ms}$) than pure in-memory locks ($\sim 1\text{ ms}$).
  - **Contention Overhead**: Under extreme concurrency, multiple threads queuing for the same row lock consume CPU cycles on the primary database, necessitating strict rate limits and connection pooling via PgBouncer.

---

### Trade-off 3: Fixed 10-Minute Hold Window vs. Dynamic / Shorter Hold Window
- **Decision**: Provide a fixed 10-minute cart reservation hold window.
- **Advantages**:
  - **Higher Checkout Conversion**: Provides users adequate time to enter payment information, perform 3D-Secure SMS/banking authentication, and coordinate with friends without experiencing checkout anxiety.
- **Disadvantages / Costs**:
  - **Temporary Inventory Starvation**: If a user abandons their cart 30 seconds after selecting seats, those seats remain locked and unavailable to other eager fans for the remaining 9.5 minutes.
  - **Mitigation**: An explicit "Cancel Reservation" button on the UI allows courteous users to immediately release seats, while the background worker aggressively reclaims seats the exact second the 600-second window elapses.
