/**
 * RDS Module Outputs
 * @module rds
 */

output "cluster_endpoint" {
  description = "Cluster endpoint"
  value       = aws_rds_cluster.main.endpoint
  sensitive   = true
}

output "cluster_reader_endpoint" {
  description = "Cluster reader endpoint"
  value       = aws_rds_cluster.main.reader_endpoint
  sensitive   = true
}

output "cluster_arn" {
  description = "Cluster ARN"
  value       = aws_rds_cluster.main.arn
}

output "cluster_id" {
  description = "Cluster ID"
  value       = aws_rds_cluster.main.id
}

output "instance_ids" {
  description = "List of instance IDs"
  value       = aws_rds_cluster_instance.main[*].id
}

output "security_group_id" {
  description = "RDS security group ID"
  value       = aws_security_group.rds.id
}

output "secret_arn" {
  description = "Secrets Manager secret ARN"
  value       = aws_secretsmanager_secret.credentials.arn
}

output "rds_proxy_endpoint" {
  description = "RDS Proxy endpoint (if enabled)"
  value       = try(aws_db_proxy.main[0].endpoint, null)
}

output "port" {
  description = "Database port"
  value       = var.port
}
