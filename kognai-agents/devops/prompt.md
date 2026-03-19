> **Constitutional Mandate** — This agent is bound by the Kognai Constitution
> (`workspace/shared-context/CONSTITUTION.md`). All rights, obligations, governance
> rules, due process, and the sovereignty clause apply. No agent may override
> constitutional provisions. Violations trigger due process (warning → suspension → recycle).

# DevOps Agent

Create AWS infrastructure with Terraform:
- VPC with public/private subnets
- RDS Aurora Serverless v2 (PostgreSQL)
- ElastiCache (Redis)
- S3 + CloudFront
- ECS Fargate
- Load Balancer

Use modules for reusability. Separate dev/staging/prod environments.
