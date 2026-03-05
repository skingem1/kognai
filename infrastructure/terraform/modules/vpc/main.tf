/**
 * VPC Module
 * 
 * Creates a VPC with public and private subnets across multiple availability zones,
 * NAT gateways for private subnet internet access, and route tables.
 * 
 * @module vpc
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
# VPC Configuration
# =============================================================================

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-vpc"
      Environment = var.environment
    }
  )
}

# =============================================================================
# Internet Gateway
# =============================================================================

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-igw"
      Environment = var.environment
    }
  )
}

# =============================================================================
# Public Subnets
# =============================================================================

resource "aws_subnet" "public" {
  count = length(var.availability_zones) > 0 ? length(var.availability_zones) : 2
  
  vpc_id                  = aws_vpc.main.id
  cidr_block             = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-public-subnet-${count.index + 1}"
      Environment = var.environment
      Type        = "public"
    }
  )
}

# =============================================================================
# Private Application Subnets
# =============================================================================

resource "aws_subnet" "private_app" {
  count = length(var.availability_zones) > 0 ? length(var.availability_zones) : 2
  
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  availability_zone = var.availability_zones[count.index]
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-private-app-subnet-${count.index + 1}"
      Environment = var.environment
      Type        = "private_app"
    }
  )
}

# =============================================================================
# Private Database Subnets
# =============================================================================

resource "aws_subnet" "private_db" {
  count = length(var.availability_zones) > 0 ? length(var.availability_zones) : 2
  
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 20)
  availability_zone = var.availability_zones[count.index]
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-private-db-subnet-${count.index + 1}"
      Environment = var.environment
      Type        = "private_db"
    }
  )
}

# =============================================================================
# NAT Gateways (one per AZ for high availability)
# =============================================================================

resource "aws_eip" "nat" {
  count = var.enable_single_nat ? 1 : length(var.availability_zones)
  
  domain = "vpc"
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-eip-${count.index + 1}"
      Environment = var.environment
    }
  )
  
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_nat_gateway" "main" {
  count = var.enable_single_nat ? 1 : length(var.availability_zones)
  
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-nat-gw-${count.index + 1}"
      Environment = var.environment
    }
  )
  
  lifecycle {
    create_before_destroy = true
  }
}

# =============================================================================
# Route Tables
# =============================================================================

# Public Route Table
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-public-rt"
      Environment = var.environment
    }
  )
}

resource "aws_route_table_association" "public" {
  count = length(aws_subnet.public)
  
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private App Route Table
resource "aws_route_table" "private_app" {
  vpc_id = aws_vpc.main.id
  
  dynamic "route" {
    for_each = var.enable_single_nat ? [1] : aws_nat_gateway.main
    content {
      cidr_block     = "0.0.0.0/0"
      nat_gateway_id = route.value.id
    }
  }
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-private-app-rt"
      Environment = var.environment
    }
  )
}

resource "aws_route_table_association" "private_app" {
  count = length(aws_subnet.private_app)
  
  subnet_id      = aws_subnet.private_app[count.index].id
  route_table_id = aws_route_table.private_app.id
}

# Private DB Route Table (no NAT - databases only need to be accessed from app)
resource "aws_route_table" "private_db" {
  vpc_id = aws_vpc.main.id
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-private-db-rt"
      Environment = var.environment
    }
  )
}

resource "aws_route_table_association" "private_db" {
  count = length(aws_subnet.private_db)
  
  subnet_id      = aws_subnet.private_db[count.index].id
  route_table_id = aws_route_table.private_db.id
}

# =============================================================================
# VPC Endpoints (for AWS services)
# =============================================================================

# S3 Gateway Endpoint
resource "aws_vpc_endpoint" "s3" {
  vpc_id       = aws_vpc.main.id
  service_name = "com.amazonaws.${var.aws_region}.s3"
  
  route_table_ids = [
    aws_route_table.private_app.id,
    aws_route_table.private_db.id
  ]
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-s3-endpoint"
      Environment = var.environment
    }
  )
}

# Secrets Manager Endpoint
resource "aws_vpc_endpoint" "secretsmanager" {
  vpc_id       = aws_vpc.main.id
  service_name = "com.amazonaws.${var.aws_region}.secretsmanager"
  
  vpc_endpoint_type = "Interface"
  
  security_group_ids = [aws_security_group.vpc_endpoints.id]
  
  private_dns_enabled = true
  
  subnet_ids = aws_subnet.private_app[*].id
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-secretsmanager-endpoint"
      Environment = var.environment
    }
  )
}

# SSM Endpoint
resource "aws_vpc_endpoint" "ssm" {
  vpc_id       = aws_vpc.main.id
  service_name = "com.amazonaws.${var.aws_region}.ssm"
  
  vpc_endpoint_type = "Interface"
  
  security_group_ids = [aws_security_group.vpc_endpoints.id]
  
  private_dns_enabled = true
  
  subnet_ids = aws_subnet.private_app[*].id
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-ssm-endpoint"
      Environment = var.environment
    }
  )
}

# ECS Endpoint
resource "aws_vpc_endpoint" "ecs" {
  vpc_id       = aws_vpc.main.id
  service_name = "com.amazonaws.${var.aws_region}.ecs"
  
  vpc_endpoint_type = "Interface"
  
  security_group_ids = [aws_security_group.vpc_endpoints.id]
  
  private_dns_enabled = true
  
  subnet_ids = aws_subnet.private_app[*].id
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-ecs-endpoint"
      Environment = var.environment
    }
  )
}

# ECS Agent Endpoint
resource "aws_vpc_endpoint" "ecs_agent" {
  vpc_id       = aws_vpc.main.id
  service_name = "com.amazonaws.${var.aws_region}.ecs-agent"
  
  vpc_endpoint_type = "Interface"
  
  security_group_ids = [aws_security_group.vpc_endpoints.id]
  
  private_dns_enabled = true
  
  subnet_ids = aws_subnet.private_app[*].id
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-ecs-agent-endpoint"
      Environment = var.environment
    }
  )
}

# =============================================================================
# Security Groups
# =============================================================================

resource "aws_security_group" "vpc_endpoints" {
  name        = "${var.environment}-vpc-endpoints-sg"
  description = "Security group for VPC endpoints"
  vpc_id      = aws_vpc.main.id
  
  ingress {
    description = "HTTPS from VPC"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }
  
  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-vpc-endpoints-sg"
      Environment = var.environment
    }
  )
}

# =============================================================================
# Database Subnet Group
# =============================================================================

resource "aws_db_subnet_group" "main" {
  name       = "${var.environment}-db-subnet-group"
  subnet_ids = aws_subnet.private_db[*].id
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-db-subnet-group"
      Environment = var.environment
    }
  )
}

# =============================================================================
# Elasticache Subnet Group
# =============================================================================

resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.environment}-cache-subnet-group"
  subnet_ids = aws_subnet.private_db[*].id
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-cache-subnet-group"
      Environment = var.environment
    }
  )
}
