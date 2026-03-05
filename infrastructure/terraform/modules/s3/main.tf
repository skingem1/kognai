/**
 * S3 Module with CloudFront CDN
 * 
 * Creates S3 buckets with Intelligent-Tiering, versioning, and
 * CloudFront distribution for content delivery.
 * 
 * @module s3
 * @requires aws >= 4.0
 */

terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

# =============================================================================
# S3 Bucket for Static Assets / Invoices
# =============================================================================

resource "aws_s3_bucket" "main" {
  bucket = var.bucket_name
  
  tags = merge(
    var.tags,
    {
      Name        = var.bucket_name
      Environment = var.environment
    }
  )
}

resource "aws_s3_bucket_versioning" "main" {
  bucket = aws_s3_bucket.main.id
  
  versioning_configuration {
    status = var.enable_versioning ? "Enabled" : "Suspended"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "main" {
  bucket = aws_s3_bucket.main.id
  
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = var.sse_algorithm
    }
  }
}

resource "aws_s3_bucket_public_access_block" "main" {
  bucket = aws_s3_bucket.main.id
  
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Intelligent-Tiering Configuration
resource "aws_s3_bucket_intelligent_tiering_configuration" "main" {
  count = var.enable_intelligent_tiering ? 1 : 0
  
  bucket = aws_s3_bucket.main.id
  name   = "IntelligentTiering"
  
  tiering {
    name          = "ARCHIVE_ACCESS"
    access_tier   = "ARCHIVE_ACCESS"
    days          = 90
  }
  
  tiering {
    name          = "DEEP_ARCHIVE_ACCESS"
    access_tier   = "DEEP_ARCHIVE_ACCESS"
    days          = 180
  }
  
  filter {
    prefix = var.intelligent_tiering_prefix
  }
}

# Lifecycle Rules
resource "aws_s3_bucket_lifecycle_configuration" "main" {
  bucket = aws_s3_bucket.main.id
  
  rule {
    id     = "transition-to-ia"
    status = var.enable_lifecycle_rules ? "Enabled" : "Disabled"
    
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
    
    transition {
      days          = 90
      storage_class = "GLACIER"
    }
    
    expiration {
      days = var.expiration_days
    }
    
    filter {
      prefix = var.lifecycle_prefix
    }
  }
  
  rule {
    id     = "abort-incomplete-multipart-upload"
    status = "Enabled"
    
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# =============================================================================
# S3 Bucket Policy for CloudFront OAC
# =============================================================================

resource "aws_s3_bucket_policy" "main" {
  count = var.enable_cloudfront && var.cloudfront_origin_access_control != null ? 1 : 0
  
  bucket = aws_s3_bucket.main.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontServicePrincipalReadOnly"
        Effect    = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.main.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" : aws_cloudfront_distribution.main[0].arn
          }
        }
      }
    ]
  })
}

# =============================================================================
# CloudFront Origin Access Control
# =============================================================================

resource "aws_cloudfront_origin_access_control" "main" {
  count = var.enable_cloudfront ? 1 : 0
  
  name                              = "${var.environment}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                   = "sigv4"
}

# =============================================================================
# CloudFront Distribution
# =============================================================================

resource "aws_cloudfront_distribution" "main" {
  count = var.enable_cloudfront ? 1 : 0
  
  enabled         = true
  is_ipv6_enabled = true
  comment         = "CloudFront for ${var.bucket_name}"
  
  aliases = var.cloudfront_aliases
  
  origin {
    domain_name = aws_s3_bucket.main.bucket_regional_domain_name
    origin_id   = "S3-${var.bucket_name}"
    
    origin_access_control_id = aws_cloudfront_origin_access_control.main[0].id
    
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }
  
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${var.bucket_name}"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    
    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
    
    function_association {
      event_type   = "viewer-request"
      function_arn = var.lambda_edge_arn != null ? var.lambda_edge_arn : null
    }
    
    min_ttl     = var.min_ttl
    default_ttl = var.default_ttl
    max_ttl     = var.max_ttl
  }
  
  # Custom error responses for SPA
  dynamic "custom_error_response" {
    for_each = var.spa_mode ? [1] : []
    content {
      error_code            = 403
      error_caching_min_ttl = 0
      response_code         = 200
      response_page_path    = "/index.html"
    }
  }
  
  dynamic "custom_error_response" {
    for_each = var.spa_mode ? [1] : []
    content {
      error_code            = 404
      error_caching_min_ttl = 0
      response_code         = 200
      response_page_path    = "/index.html"
    }
  }
  
  price_class = var.price_class
  
  restrictions {
    geo_restriction {
      restriction_type = var.geo_restriction_type
      locations         = var.geo_restriction_locations
    }
  }
  
  viewer_certificate {
    acm_certificate_arn            = var.acm_certificate_arn
    ssl_support_method             = "sni-only"
    minimum_protocol_version       = "TLSv1.2_2021"
  }
  
  logging_config {
    bucket          = var.logging_bucket != null ? var.logging_bucket : "${var.bucket_name}-logs.s3.amazonaws.com"
    include_cookies = false
    prefix          = "cloudfront/"
  }
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-cloudfront"
      Environment = var.environment
    }
  )
}

# =============================================================================
# CloudFront Cache Policy
# =============================================================================

resource "aws_cloudfront_cache_policy" "main" {
  count = var.enable_cloudfront ? 1 : 0
  
  name       = "${var.environment}-cache-policy"
  comment    = "Cache policy for ${var.bucket_name}"
  
  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    
    headers_config {
      header_behavior = "none"
    }
    
    query_strings_config {
      query_string_behavior = "none"
    }
    
    enable_accept_encoding = true
    gzip                   = true
  }
}

# =============================================================================
# S3 Inventory Configuration (optional)
# =============================================================================

resource "aws_s3_bucket_inventory" "main" {
  count = var.enable_inventory ? 1 : 0
  
  bucket = aws_s3_bucket.main.id
  name   = "daily-inventory"
  
  included_object_versions = "All"
  
  schedule {
    frequency = "Daily"
  }
  
  destination {
    s3_bucket_destination {
      bucket = var.inventory_bucket != null ? var.inventory_bucket : aws_s3_bucket.main.id
      format = "Parquet"
      
      encryption {
        sse_kms {
          object_key_encryption_suffix = "kms"
        }
      }
    }
  }
}
