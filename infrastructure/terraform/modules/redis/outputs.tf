/**
 * Redis Module Outputs
 * @module redis
 */

output "primary_endpoint" {
  description = "Primary endpoint"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "reader_endpoint" {
  description = "Reader endpoint"
  value       = try(aws_elasticache_replication_group.main.reader_endpoint_address, null)
}

output "port" {
  description = "Redis port"
  value       = var.port
}

output "replication_group_id" {
  description = "Replication group ID"
  value       = aws_elasticache_replication_group.main.id
}

output "security_group_id" {
  description = "Redis security group ID"
  value       = aws_security_group.redis.id
}

output "member_clusters" {
  description = "List of member cluster IDs"
  value       = aws_elasticache_replication_group.main.member_clusters
}

output "global_replication_group_id" {
  description = "Global replication group ID (if enabled)"
  value       = try(aws_elasticache_global_replication_group.main[0].id, null)
}
