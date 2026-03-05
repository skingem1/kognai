/**
 * ElastiCache Redis Module
 * 
 * Creates a Redis ElastiCache cluster with node type t4g.small,
 * automatic failover, and multi-AZ deployment.
 * 
 * @module redis
 * @requires aws >= 4.0
 */

terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# =============================================================================
# ElastiCache Subnet Group (already created by VPC module, reference only)
# =============================================================================

data "aws_elasticache_subnet_group" "main" {
  name = var.subnet_group_name
}

# =============================================================================
# ElastiCache Parameter Group
# =============================================================================

resource "aws_elasticache_parameter_group" "main" {
  name   = "${var.environment}-redis7"
  family = "redis7"
  
  # Enable Redis 7 features
  parameter {
    name  = "activedbfrag"
    value = "1"
  }
  
  parameter {
    name  = "min-slaves-to-write"
    value = var.num_cache_clusters > 1 ? "1" : "0"
  }
  
  parameter {
    name  = "min-slaves-max-lag"
    value = "30"
  }
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-redis7-param-group"
      Environment = var.environment
    }
  )
}

# =============================================================================
# ElastiCache Replication Group
# =============================================================================

resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "${var.environment}-redis"
  replication_group_description = "Redis cluster for ${var.environment}"
  
  engine               = "redis"
  engine_version       = var.engine_version
  node_type            = var.node_type
  
  port                 = var.port
  parameter_group_name = aws_elasticache_parameter_group.main.name
  subnet_group_name    = var.subnet_group_name
  
  security_group_ids   = [aws_security_group.redis.id]
  
  num_cache_clusters       = var.num_cache_clusters
  num_node_groups          = var.num_node_groups
  replicas_per_node_group  = var.num_cache_clusters > 1 ? 1 : 0
  
  automatic_failover_enabled = var.num_cache_clusters > 1 ? true : false
  multi_az_enabled           = var.multi_az_enabled && var.num_cache_clusters > 1
  
  at_rest_encryption_enabled = var.enable_encryption
  transit_encryption_enabled = var.enable_encryption
  auth_token_enabled         = var.enable_auth
  
  auto_minor_version_upgrade = true
  auto_failover_enabled      = var.num_cache_clusters > 1 ? true : false
  
  snapshot_retention_limit   = var.snapshot_retention_days
  snapshot_window           = var.snapshot_window
  maintenance_window        = var.maintenance_window
  
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "slow-log"
  }
  
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_engine.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "engine-log"
  }
  
  lifecycle {
    create_before_destroy = true
  }
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-redis-cluster"
      Environment = var.environment
    }
  )
}

# =============================================================================
# CloudWatch Log Groups for Redis
# =============================================================================

resource "aws_cloudwatch_log_group" "redis_slow" {
  name              = "/aws/elasticache/${var.environment}/redis/slow-log"
  retention_in_days = var.log_retention_days
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-redis-slow-log"
      Environment = var.environment
    }
  )
}

resource "aws_cloudwatch_log_group" "redis_engine" {
  name              = "/aws/elasticache/${var.environment}/redis/engine-log"
  retention_in_days = var.log_retention_days
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-redis-engine-log"
      Environment = var.environment
    }
  )
}

# =============================================================================
# Redis Security Group
# =============================================================================

resource "aws_security_group" "redis" {
  name        = "${var.environment}-redis-sg"
  description = "Security group for ElastiCache Redis"
  vpc_id      = var.vpc_id
  
  ingress {
    description     = "Redis from VPC"
    from_port       = var.port
    to_port         = var.port
    protocol        = "tcp"
    cidr_blocks     = [var.vpc_cidr]
  }
  
  egress {
    description     = "Allow all outbound"
    from_port       = 0
    to_port         = 0
    protocol        = "-1"
    cidr_blocks     = ["0.0.0.0/0"]
  }
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-redis-sg"
      Environment = var.environment
    }
  )
}

# =============================================================================
# ElastiCache Global Replication Group (optional - for cross-region)
# =============================================================================

resource "aws_elasticache_global_replication_group" "main" {
  count = var.enable_global_replication ? 1 : 0
  
  global_replication_group_id       = "${var.environment}-global-redis"
  global_replication_group_description = "Global Redis for ${var.environment}"
  
  primary_replication_group_id = aws_elasticache_replication_group.main.id
  
  at_rest_encryption_enabled  = var.enable_encryption
  transit_encryption_enabled  = var.enable_auth
  
  lifecycle {
    create_before_destroy = true
  }
}
