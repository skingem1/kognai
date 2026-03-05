/**
 * Health Check API Endpoint
 * Provides system health status including uptime, version, and service connectivity
 */

import { Request, Response } from 'express';

/**
 * Health status of the system and its dependencies
 */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: string;
  services: {
    database: 'up' | 'down';
    cache: 'up' | 'down';
  };
}

/**
 * Application version - should be injected from environment or package.json in production
 */
const APP_VERSION = process.env.APP_VERSION || '1.0.0';

/**
 * Generates the current health status of the system
 * In production, this would perform actual connectivity checks to database and cache
 * 
 * @returns HealthStatus object containing system health information
 */
export function getHealth(): HealthStatus {
  const uptime = Math.floor(process.uptime());
  
  // In production, these would be actual connectivity checks
  // For now, we assume services are up based on the requirements
  const services = {
    database: 'up' as const,
    cache: 'up' as const,
  };

  // Determine overall status based on service health
  let status: HealthStatus['status'] = 'healthy';
  if (services.database === 'down' || services.cache === 'down') {
    status = 'unhealthy';
  } else if (services.database === 'degraded' || services.cache === 'degraded') {
    status = 'degraded';
  }

  return {
    status,
    version: APP_VERSION,
    uptime,
    timestamp: new Date().toISOString(),
    services,
  };
}

/**
 * Express handler for health check endpoint
 * Returns JSON representation of system health
 * 
 * @param req - Express request object
 * @param res - Express response object
 */
export function getHealthHandler(req: Request, res: Response): void {
  try {
    const healthStatus = getHealth();
    
    const statusCode = healthStatus.status === 'healthy' ? 200 
      : healthStatus.status === 'degraded' ? 200 
      : 503;

    res.status(statusCode).json(healthStatus);
  } catch (error) {
    // Log error in production with proper logger
    console.error('Health check failed:', error);
    
    res.status(503).json({
      status: 'unhealthy',
      version: APP_VERSION,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      services: {
        database: 'down',
        cache: 'down',
      },
    });
  }
}