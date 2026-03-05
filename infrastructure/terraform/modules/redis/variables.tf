/**
 * Redis Module Variables
 * @module redis
 */

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "vpc_cidr" {
  description = "VPC CIDR block for security group"
  type        = string
  default     = "10.0.0.0/16"
}

variable "subnet_group_name" {
  description = "ElastiCache subnet group name"
  type        = string
}

variable "node_type" {
  description = "Node type for Redis cluster"
  type        = string
  default     = "cache.t4g.small"
}

variable "engine_version" {
  description = "Redis engine version"
  type        = string
  default     = "7.0"
}

variable "port" {
  description = "Redis port"
  type        = number
  default     = 6379
}

variable "num_cache_clusters" {
  description = "Number of cache clusters (2 for HA)"
  type        = number
  default     = 2
}

variable "num_node_groups" {
  description = "Number of node groups (shards)"
  type        = number
  default     = 1
}

variable "multi_az_enabled" {
  description = "Enable Multi-AZ"
  type        = bool
  default     = true
}

variable "enable_encryption" {
  description = "Enable encryption at rest and in transit"
  type        = bool
  default     = true
}

variable "enable_auth" {
  description = "Enable Redis Auth (AUTH command)"
  type        = bool
  default     = true
}

variable "enable_global_replication" {
  description = "Enable global replication for DR"
  type        = bool
  default     = false
}

variable "snapshot_retention_days" {
  description = "Snapshot retention days"
  type        = number
  default     = 7
}

variable "snapshot_window" {
  description = "Snapshot window"
  type        = string
  default     = "03:00-05:00"
}

variable "maintenance_window" {
  description = "Maintenance window"
  type        = string
  default     = "mon:05:00-mon:07:00"
}

variable "log_retention_days" {
  description = "CloudWatch log retention days"
  type        = number
  default     = 7
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
