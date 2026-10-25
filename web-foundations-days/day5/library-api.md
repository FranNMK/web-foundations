# Library Books REST API Design

A RESTful API specification for managing a library's books resource.

## Endpoints

### 1. List All Books
- **Method**: `GET`
- **Path**: `/api/books`
- **Description**: Returns a list of all books available in the library collection.
- **Request Body**: None
- **Success Status Code**: `200 OK`

### 2. Get One Book
- **Method**: `GET`
- **Path**: `/api/books/:id`
- **Description**: Retrieves full details of a specific book by its unique ID.
- **Request Body**: None
- **Success Status Code**: `200 OK`

### 3. Create a Book
- **Method**: `POST`
- **Path**: `/api/books`
- **Description**: Creates a new book entry in the library catalog.
- **Request Body**:
  ```json
  {
    "title": "Clean Code",
    "author": "Robert C. Martin",
    "isbn": "978-0132350884",
    "publishedYear": 2008,
    "genre": "Software Engineering",
    "availableCopies": 4
  }
  ```
- **Success Status Code**: `201 Created`

### 4. Update a Book
- **Method**: `PUT`
- **Path**: `/api/books/:id`
- **Description**: Updates all fields of an existing book record identified by its ID.
- **Request Body**:
  ```json
  {
    "title": "Clean Code: A Handbook of Agile Software Craftsmanship",
    "author": "Robert C. Martin",
    "isbn": "978-0132350884",
    "publishedYear": 2008,
    "genre": "Software Engineering",
    "availableCopies": 3
  }
  ```
- **Success Status Code**: `200 OK`

### 5. Delete a Book
- **Method**: `DELETE`
- **Path**: `/api/books/:id`
- **Description**: Removes an existing book record permanently from the library catalog.
- **Request Body**: None
- **Success Status Code**: `200 OK` (or `204 No Content`)

### 6. List Books by Author
- **Method**: `GET`
- **Path**: `/api/books?author={authorName}`
- **Description**: Retrieves all books written by a specific author using a query parameter.
- **Request Body**: None
- **Success Status Code**: `200 OK`

## Common Error Codes

### 400 Bad Request
- **Error Code**: `400 Bad Request`
- **Description**: The server cannot process the request due to client error, such as invalid syntax or missing required fields in the request body.
- **When it happens**:
  - The client sends a `POST /api/books` request omitting a mandatory field such as `"title"` or `"author"`.
  - The client provides invalid data types, such as passing a string `"two-thousand"` for `"publishedYear"` when an integer is required.
  - The client sends malformed JSON in the request body.
- **Example Response Body**:
  ```json
  {
    "error": "Bad Request",
    "message": "Validation failed: 'title' is a required field and 'publishedYear' must be an integer.",
    "statusCode": 400
  }
  ```

### 404 Not Found
- **Error Code**: `404 Not Found`
- **Description**: The server cannot find the requested resource because the specified identifier does not exist.
- **When it happens**:
  - The client sends a `GET /api/books/9999` request for a book ID that does not exist in the database.
  - The client sends a `PUT /api/books/9999` or `DELETE /api/books/9999` request targeting a non-existent book ID.
- **Example Response Body**:
  ```json
  {
    "error": "Not Found",
    "message": "Book with ID 9999 was not found.",
    "statusCode": 404
  }
  ```
