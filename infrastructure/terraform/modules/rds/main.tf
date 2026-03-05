/**
 * RDS Aurora Serverless v2 Module
 * 
 * Creates an Aurora PostgreSQL Serverless v2 cluster with auto-scaling,
 * multi-AZ deployment, and automated backups.
 * 
 * @module rds
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
# Secrets Manager Secret for Database Credentials
# =============================================================================

resource "aws_secretsmanager_secret" "credentials" {
  name_prefix = "${var.environment}-aurora-"
  description = "Aurora PostgreSQL credentials for ${var.environment}"
  
  recovery_window_in_days = var.recovery_window_in_days
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-db-credentials"
      Environment = var.environment
    }
  )
}

resource "aws_secretsmanager_secret_version" "credentials" {
  secret_id = aws_secretsmanager_secret.credentials.id
  
  secret_string = jsonencode({
    username = var.master_username
    password = var.master_password
    engine   = "aurora-postgresql"
    host     = aws_rds_cluster.main.endpoint
    port     = var.port
    db_name  = var.database_name
  })
}

# =============================================================================
# RDS Cluster Parameter Group
# =============================================================================

resource "aws_rds_cluster_parameter_group" "main" {
  name   = "${var.environment}-aurora-pg15"
  family = "aurora-postgresql15"
  
  parameter {
    name  = "aurora_parallel_query"
    value = "1"
  }
  
  parameter {
    name  = "aurora_enable_read_replica"
    value = "1"
  }
  
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-aurora-pg15-param-group"
      Environment = var.environment
    }
  )
}

# =============================================================================
# RDS Cluster
# =============================================================================

resource "aws_rds_cluster" "main" {
  cluster_identifier        = "${var.environment}-aurora-cluster"
  engine                    = "aurora-postgresql"
  engine_version            = var.engine_version
  engine_mode               = "provisioned"
  
  database_name             = var.database_name
  master_username           = var.master_username
  master_password           = var.master_password
  
  port                      = var.port
  
  db_subnet_group_name      = var.db_subnet_group_name
  vpc_security_group_ids    = [aws_security_group.rds.id]
  
  serverlessv2_scale_configuration {
    min_capacity = var.min_acus
    max_capacity = var.max_acus
  }
  
  storage_encrypted         = true
  kms_key_id                = var.kms_key_id
  
  backup_retention_period   = var.backup_retention_days
  preferred_backup_window   = var.preferred_backup_window
  preferred_maintenance_window = var.preferred_maintenance_window
  
  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.environment}-aurora-final-snapshot"
  
  copy_tags_to_snapshot     = true
  
  enabled_cloudwatch_logs_exports = var.enable_cloudwatch_logs ? [
    "postgresql",
    "upgrade"
  ] : []
  
  lifecycle {
    create_before_destroy = true
    ignore_changes        = [master_password]
  }
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-aurora-cluster"
      Environment = var.environment
    }
  )
}

# =============================================================================
# RDS Cluster Instance
# =============================================================================

resource "aws_rds_cluster_instance" "main" {
  count = var.multi_az ? 2 : 1
  
  cluster_identifier = aws_rds_cluster.main.id
  
  instance_identifier = "${var.environment}-aurora-instance-${count.index + 1}"
  
  engine                    = aws_rds_cluster.main.engine
  engine_version            = aws_rds_cluster.main.engine_version
  instance_class            = "db.serverless"
  
  publicly_accessible = false
  
  performance_insights_enabled     = var.enable_performance_insights
  performance_insights_kms_key_id  = var.kms_key_id
  
  monitoring_interval = var.enable_enhanced_monitoring ? 60 : 0
  monitoring_role_arn = var.enable_enhanced_monitoring ? aws_iam_role.rds_monitoring.arn : null
  
  auto_minor_version_upgrade = true
  promotion_tier             = count.index == 0 ? 0 : 1
  
  lifecycle {
    create_before_destroy = true
  }
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-aurora-instance-${count.index + 1}"
      Environment = var.environment
    }
  )
}

# =============================================================================
# RDS Security Group
# =============================================================================

resource "aws_security_group" "rds" {
  name        = "${var.environment}-rds-sg"
  description = "Security group for Aurora RDS cluster"
  vpc_id      = var.vpc_id
  
  ingress {
    description     = "PostgreSQL from VPC"
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
      Name        = "${var.environment}-rds-sg"
      Environment = var.environment
    }
  )
}

# =============================================================================
# IAM Role for Enhanced Monitoring
# =============================================================================

resource "aws_iam_role" "rds_monitoring" {
  count = var.enable_enhanced_monitoring ? 1 : 0
  
  name = "${var.environment}-rds-monitoring-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  count = var.enable_enhanced_monitoring ? 1 : 0
  
  role       = aws_iam_role.rds_monitoring[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# =============================================================================
# RDS Proxy (for connection pooling - optional)
# =============================================================================

resource "aws_db_proxy" "main" {
  count = var.enable_rds_proxy ? 1 : 0
  
  name                   = "${var.environment}-rds-proxy"
  debug_logging          = false
  engine_family          = "POSTGRESQL"
  vpc_security_group_ids = [aws_security_group.rds.id]
  vpc_subnet_ids         = var.private_subnet_ids
  
  auth {
    auth_scheme = "SECRETS"
    secret_arn  = aws_secretsmanager_secret.credentials.arn
    iam_auth    = "DISABLED"
  }
  
  idle_client_timeout    = 1800
  max_connections_percent = 100
  min_connections_percent = 10
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-rds-proxy"
      Environment = var.environment
    }
  )
}

resource "aws_db_proxy_default_target_group" "main" {
  count = var.enable_rds_proxy ? 1 : 0
  
  db_proxy_name = aws_db_proxy.main[0].name
  
  connection_pool_config {
    max_connections_percent = 100
    min_connections_percent = 10
    connection_timeout      = 120
  }
}

resource "aws_db_proxy_target" "main" {
  count = var.enable_rds_proxy ? 1 : 0
  
  db_proxy_name    = aws_db_proxy.main[0].name
  target_group_name = aws_db_proxy_default_target_group.main[0].name
  db_cluster_identifier = aws_rds_cluster.main.id
}
