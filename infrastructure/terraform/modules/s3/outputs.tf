/**
 * S3 Module Outputs
 * @module s3
 */

output "bucket_name" {
  description = "S3 bucket name"
  value       = aws_s3_bucket.main.id
}

output "bucket_arn" {
  description = "S3 bucket ARN"
  value       = aws_s3_bucket.main.arn
}

output "bucket_regional_domain_name" {
  description = "S3 bucket regional domain name"
  value       = aws_s3_bucket.main.bucket_regional_domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = try(aws_cloudfront_distribution.main[0].id, null)
}

output "cloudfront_distribution_arn" {
  description = "CloudFront distribution ARN"
  value       = try(aws_cloudfront_distribution.main[0].arn, null)
}

output "cloudfront_domain_name" {
  description = "CloudFront domain name"
  value       = try(aws_cloudfront_distribution.main[0].domain_name, null)
}

output "cloudfront_zone_id" {
  description = "CloudFront zone ID for Route53"
  value       = try(aws_cloudfront_distribution.main[0].hosted_zone_id, null)
}

output "origin_access_control_id" {
  description = "CloudFront OAC ID"
  value       = try(aws_cloudfront_origin_access_control.main[0].id, null)
}
