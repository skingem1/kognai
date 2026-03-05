/**
 * S3 Module Variables
 * @module s3
 */

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "bucket_name" {
  description = "S3 bucket name"
  type        = string
}

variable "enable_versioning" {
  description = "Enable S3 versioning"
  type        = bool
  default     = true
}

variable "enable_intelligent_tiering" {
  description = "Enable S3 Intelligent-Tiering"
  type        = bool
  default     = true
}

variable "intelligent_tiering_prefix" {
  description = "Prefix for Intelligent-Tiering"
  type        = string
  default     = "invoices/"
}

variable "enable_lifecycle_rules" {
  description = "Enable lifecycle rules"
  type        = bool
  default     = true
}

variable "lifecycle_prefix" {
  description = "Prefix for lifecycle rules"
  type        = string
  default     = ""
}

variable "expiration_days" {
  description = "Days before objects expire"
  type        = number
  default     = 365
}

variable "sse_algorithm" {
  description = "SSE algorithm"
  type        = string
  default     = "AES256"
}

variable "enable_cloudfront" {
  description = "Enable CloudFront CDN"
  type        = bool
  default     = true
}

variable "cloudfront_aliases" {
  description = "CloudFront aliases (CNAMEs)"
  type        = list(string)
  default     = []
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for CloudFront"
  type        = string
  default     = null
}

variable "price_class" {
  description = "CloudFront price class"
  type        = string
  default     = "PriceClass_All"
}

variable "spa_mode" {
  description = "Enable SPA mode (serve index.html for 403/404)"
  type        = bool
  default     = false
}

variable "min_ttl" {
  description = "Minimum TTL for CloudFront cache"
  type        = number
  default     = 0
}

variable "default_ttl" {
  description = "Default TTL for CloudFront cache"
  type        = number
  default     = 86400
}

variable "max_ttl" {
  description = "Maximum TTL for CloudFront cache"
  type        = number
  default     = 31536000
}

variable "geo_restriction_type" {
  description = "Geo restriction type"
  type        = string
  default     = "none"
}

variable "geo_restriction_locations" {
  description = "Geo restriction locations"
  type        = list(string)
  default     = []
}

variable "logging_bucket" {
  description = "Logging bucket for CloudFront"
  type        = string
  default     = null
}

variable "lambda_edge_arn" {
  description = "Lambda@Edge ARN for request/response modification"
  type        = string
  default     = null
}

variable "enable_inventory" {
  description = "Enable S3 inventory"
  type        = bool
  default     = false
}

variable "inventory_bucket" {
  description = "Inventory destination bucket"
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
