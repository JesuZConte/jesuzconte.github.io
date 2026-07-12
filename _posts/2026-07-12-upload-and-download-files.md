---
layout: post
title: "Handling File Uploads and Downloads Cleanly in Spring Boot REST APIs"
date: 2026-07-12
categories: [Spring-Boot, Web-Development]
tags: [java, file-upload, multipart, rest-api, stream]
---

Managing binary assets (such as profile images, invoices, or system logs) is a common requirement in enterprise software engineering. In Spring Boot, this is achieved by leveraging the `MultipartFile` contract for uploads and the `Resource` abstraction layer for downloads.

Here is the architectural guide to implementing these features securely and efficiently.

---

### 1. Inbound: File Uploads via `multipart/form-data`

When uploading files, the HTTP request content type must be explicitly designated as `multipart/form-data`. This instructs the client to split the payload into dedicated boundaries, segregating text attributes from raw binary bitstreams.

```java
@PostMapping(value = "/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
public ResponseEntity<String> uploadDocument(@RequestParam("file") MultipartFile file) throws IOException {
    if (file.isEmpty()) {
        throw new IllegalArgumentException("Target payload file stream cannot be empty");
    }
    
    String filename = file.getOriginalFilename();
    byte[] fileBytes = file.getBytes(); // Ready to be piped to Google Cloud Storage or AWS S3
    
    return ResponseEntity.ok("Successfully ingested: " + filename);
}
```
- `@RequestParam` vs `@RequestPart`: Use `@RequestParam` for simple file attachments. Switch to `@RequestPart` when processing complex payloads where one part is a structural JSON DTO and the other part is the binary stream.

### 2. Outbound: File Downloads via Resource Streams
To securely stream a file back to a client browser, wrap the binary arrays inside a Spring Resource instance and format the necessary HTTP download indicators.

```java
@GetMapping("/documents/{id}")
public ResponseEntity<Resource> downloadDocument(@PathVariable Long id) {
    byte[] documentContent = documentService.loadBytes(id);
    ByteArrayResource resource = new ByteArrayResource(documentContent);

    return ResponseEntity.ok()
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"report.pdf\"")
        .contentType(MediaType.APPLICATION_PDF)
        .contentLength(documentContent.length)
        .body(resource);
}
```
- `Content-Disposition: attachment`: This header is crucial. It tells the user's browser to forcefully trigger a local file system "Save As" download prompt instead of trying to render the file inline.

### Production Limits Configuration
By default, Spring Boot caps individual file uploads at **1MB**. To handle corporate workloads without encountering `MaxUploadSizeExceededException` crashes, adjust boundaries inside your `application.yml`:
```yaml
spring:
  servlet:
    multipart:
      max-file-size: 5MB       # Max ceiling threshold for any single file asset.
      max-request-size: 10MB   # Max structural payload cap per dynamic multi-part call execution.
```

