# REST API Homework: Library System

Design (don't build) the API for a small library app.

## Requirements
- Members can search books, borrow up to 3 at a time, and return them.
- Librarians can add, edit, and remove books.
- A book can't be borrowed by two members at once.

## Hand in
1. A table of endpoints: method, path, who can call it, request body, response.
2. The status code each endpoint returns on success and on its two most likely errors.
3. One paragraph on how you'd stop a member from borrowing a 4th book.

Use plural nouns for paths (`/books`, `/loans`) and keep verbs out of them.
