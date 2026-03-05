/**
 * ECS Fargate Module
 * 
 * Creates ECS clusters, services, and task definitions for API
 * and worker services with Spot instance support for cost optimization.
 * 
 * @module ecs
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
# ECS Cluster
# =============================================================================

resource "aws_ecs_cluster" "main" {
  name = "${var.environment}-ecs-cluster"
  
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
  
  configuration {
    execute_command_configuration {
      logging = "DEFAULT"
      
      kms_key_id = var.kms_key_id
    }
  }
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-ecs-cluster"
      Environment = var.environment
    }
  )
}

# =============================================================================
# ECS Cluster Capacity Providers
# =============================================================================

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name
  
  default_capacity_provider_strategy {
    base              = var.api_capacity_base
    weight            = var.api_capacity_weight
    capacity_provider = "FARGATE"
  }
  
  dynamic "capacity_provider_strategy" {
    for_each = var.enable_spot_for_workers ? ["SPOT"] : []
    content {
      base              = 0
      weight            = var.worker_spot_weight
      capacity_provider = "FARGATE_SPOT"
    }
  }
}

# =============================================================================
# Security Groups
# =============================================================================

# ALB Security Group
resource "aws_security_group" "alb" {
  count = var.create_alb ? 1 : 0
  
  name        = "${var.environment}-alb-sg"
  description = "Security group for Application Load Balancer"
  vpc_id      = var.vpc_id
  
  ingress {
    description     = "HTTP from internet"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    cidr_blocks     = ["0.0.0.0/0"]
  }
  
  ingress {
    description     = "HTTPS from internet"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    cidr_blocks     = ["0.0.0.0/0"]
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
      Name        = "${var.environment}-alb-sg"
      Environment = var.environment
    }
  )
}

# ECS Tasks Security Group
resource "aws_security_group" "ecs_tasks" {
  name        = "${var.environment}-ecs-tasks-sg"
  description = "Security group for ECS tasks"
  vpc_id      = var.vpc_id
  
  ingress {
    description     = "HTTP from ALB"
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb[0].id]
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
      Name        = "${var.environment}-ecs-tasks-sg"
      Environment = var.environment
    }
  )
}

# =============================================================================
# Application Load Balancer
# =============================================================================

resource "aws_lb" "main" {
  count = var.create_alb ? 1 : 0
  
  name               = "${var.environment}-alb"
  internal           = var.alb_internal
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb[0].id]
  subnets            = var.public_subnet_ids
  
  enable_deletion_protection = var.alb_deletion_protection
  enable_cross_zone_load_balancing = true
  
  access_logs {
    bucket  = var.alb_log_bucket
    prefix  = "alb-logs"
    enabled = var.enable_alb_logs
  }
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-alb"
      Environment = var.environment
    }
  )
}

resource "aws_lb_target_group" "api" {
  count = var.create_alb ? 1 : 0
  
  name     = "${var.environment}-api-tg"
  port     = var.container_port
  protocol = "HTTP"
  vpc_id   = var.vpc_id
  
  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 5
    interval            = 30
    path                = var.health_check_path
    matcher             = "200"
  }
  
  target_type = "ip"
  
  lifecycle {
    create_before_destroy = true
  }
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-api-tg"
      Environment = var.environment
    }
  )
}

resource "aws_lb_listener" "http" {
  count = var.create_alb && var.ssl_certificate_arn != null ? 0 : 1
  
  load_balancer_arn = aws_lb.main[0].arn
  port              = 80
  protocol          = "HTTP"
  
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api[0].arn
  }
}

resource "aws_lb_listener" "https" {
  count = var.create_alb && var.ssl_certificate_arn != null ? 1 : 0
  
  load_balancer_arn = aws_lb.main[0].arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-2016-08"
  certificate_arn   = var.ssl_certificate_arn
  
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api[0].arn
  }
}

# =============================================================================
# IAM Roles
# =============================================================================

# ECS Task Execution Role
resource "aws_iam_role" "ecs_task_execution" {
  name = "${var.environment}-ecs-task-execution-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# ECS Task Role
resource "aws_iam_role" "ecs_task" {
  name = "${var.environment}-ecs-task-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

# =============================================================================
# CloudWatch Log Group
# =============================================================================

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${var.environment}"
  retention_in_days = var.log_retention_days
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-ecs-logs"
      Environment = var.environment
    }
  )
}

# =============================================================================
# ECS Task Definitions
# =============================================================================

# API Task Definition
resource "aws_ecs_task_definition" "api" {
  family                   = "${var.environment}-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn           = aws_iam_role.ecs_task.arn
  
  container_definitions = jsonencode([
    {
      name      = "api"
      image     = var.api_image
      essential = true
      
      portMappings = [
        {
          containerPort = var.container_port
          protocol      = "tcp"
        }
      ]
      
      environment = [
        for key, value in var.api_environment : {
          name  = key
          value = value
        }
      ]
      
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "api"
        }
      }
      
      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:${var.container_port}${var.health_check_path} || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
      
      readonlyRootFilesystem = var.enable_readonly_root
      privileged             = false
    }
  ])
  
  volume {
    name = "efs"
    
    efs_volume_configuration {
      file_system_id     = var.efs_id
      root_directory     = "/"
      transit_encryption = "ENABLED"
      iam_permission     = "ECS_TASK_EXECUTION"
    }
  }
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-api-task"
      Environment = var.environment
    }
  )
}

# Worker Task Definition
resource "aws_ecs_task_definition" "worker" {
  count = var.enable_workers ? 1 : 0
  
  family                   = "${var.environment}-worker"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.worker_cpu
  memory                   = var.worker_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn           = aws_iam_role.ecs_task.arn
  
  container_definitions = jsonencode([
    {
      name      = "worker"
      image     = var.worker_image
      essential = true
      
      environment = [
        for key, value in var.worker_environment : {
          name  = key
          value = value
        }
      ]
      
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "worker"
        }
      }
      
      readonlyRootFilesystem = var.enable_readonly_root
      privileged             = false
    }
  ])
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-worker-task"
      Environment = var.environment
    }
  )
}

# =============================================================================
# ECS Services
# =============================================================================

# API Service
resource "aws_ecs_service" "api" {
  name            = "${var.environment}-api-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  
  launch_type = "FARGATE"
  
  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }
  
  load_balancer {
    target_group_arn = aws_lb_target_group.api[0].arn
    container_name   = "api"
    container_port   = var.container_port
  }
  
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  
  deployment_minimum_healthy_percent = var.deployment_min_healthy_percent
  deployment_maximum_percent         = var.deployment_max_percent
  
  health_check_grace_period_seconds = 60
  
  enable_ecs_managed_tags = true
  
  propagate_tags = "SERVICE"
  
  lifecycle {
    create_before_destroy = true
    ignore_changes        = [desired_count]
  }
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-api-service"
      Environment = var.environment
    }
  )
}

# Worker Service
resource "aws_ecs_service" "worker" {
  count = var.enable_workers ? 1 : 0
  
  name            = "${var.environment}-worker-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker[0].arn
  desired_count   = var.worker_desired_count
  
  launch_type = "FARGATE"
  
  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }
  
  capacity_provider_strategy {
    base              = 0
    weight            = var.worker_spot_weight
    capacity_provider = "FARGATE_SPOT"
  }
  
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  
  deployment_minimum_healthy_percent = var.deployment_min_healthy_percent
  deployment_maximum_percent         = var.deployment_max_percent
  
  enable_ecs_managed_tags = true
  
  propagate_tags = "SERVICE"
  
  lifecycle {
    create_before_destroy = true
    ignore_changes        = [desired_count]
  }
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-worker-service"
      Environment = var.environment
    }
  )
}

# =============================================================================
# Auto Scaling
# =============================================================================

resource "aws_appautoscaling_target" "api" {
  max_capacity       = var.api_max_capacity
  min_capacity       = var.api_min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  role_arn           = var.autoscaling_role_arn
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "${var.environment}-api-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  
  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    
    target_value       = var.api_cpu_target
    scale_in_cooldown  = var.scale_in_cooldown
    scale_out_cooldown = var.scale_out_cooldown
  }
}

resource "aws_appautoscaling_policy" "api_memory" {
  name               = "${var.environment}-api-memory-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  
  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    
    target_value       = var.api_memory_target
    scale_in_cooldown  = var.scale_in_cooldown
    scale_out_cooldown = var.scale_out_cooldown
  }
}

# Worker Auto Scaling
resource "aws_appautoscaling_target" "worker" {
  count = var.enable_workers ? 1 : 0
  
  max_capacity       = var.worker_max_capacity
  min_capacity       = var.worker_min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.worker[0].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  role_arn           = var.autoscaling_role_arn
}

resource "aws_appautoscaling_policy" "worker_cpu" {
  count = var.enable_workers ? 1 : 0
  
  name               = "${var.environment}-worker-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.worker[0].resource_id
  scalable_dimension = aws_appautoscaling_target.worker[0].scalable_dimension
  
  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    
    target_value       = var.worker_cpu_target
    scale_in_cooldown  = var.scale_in_cooldown
    scale_out_cooldown = var.scale_out_cooldown
  }
}

# =============================================================================
# Scheduled Scaling for Workers (optional)
# =============================================================================

resource "aws_appautoscaling_scheduled_action" "worker_scale_up" {
  count = var.enable_workers && var.enable_scheduled_scaling ? 1 : 0
  
  name               = "${var.environment}-worker-scale-up"
  service_namespace  = "ecs"
  resource_id        = aws_appautoscaling_target.worker[0].resource_id
  scalable_dimension = aws_appautoscaling_target.worker[0].scalable_dimension
  
  schedule = var.worker_scale_up_schedule
  
  scalable_target_action {
    min_capacity = var.worker_min_capacity
    max_capacity = var.worker_max_capacity
  }
}

resource "aws_appautoscaling_scheduled_action" "worker_scale_down" {
  count = var.enable_workers && var.enable_scheduled_scaling ? 1 : 0
  
  name               = "${var.environment}-worker-scale-down"
  service_namespace  = "ecs"
  resource_id        = aws_appautoscaling_target.worker[0].resource_id
  scalable_dimension = aws_appautoscaling_target.worker[0].scalable_dimension
  
  schedule = var.worker_scale_down_schedule
  
  scalable_target_action {
    min_capacity = 1
    max_capacity = 2
  }
}
