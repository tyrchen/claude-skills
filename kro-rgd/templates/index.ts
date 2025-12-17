/**
 * KRO ResourceGraphDefinition Templates
 *
 * This module exports all RGD template functions for easy import.
 *
 * Usage:
 *   import {
 *     createWebApplicationRgd,
 *     createDatabaseApplicationRgd,
 *     createFullStackApplicationRgd,
 *     createMultiEnvironmentRgd,
 *   } from "./templates";
 *
 * Each template creates a ResourceGraphDefinition that:
 * 1. Defines a custom Kubernetes API (CRD)
 * 2. Composes multiple resources with dependencies
 * 3. Uses CEL expressions for dynamic configuration
 * 4. Integrates with AWS services via ACK controllers
 */

// Web Application Stack
// Creates: Deployment + Service + optional Ingress + HPA + PDB
export { createWebApplicationRgd, WebApplicationRgdArgs } from "./web-application";

// Database Application with AWS RDS
// Creates: RDS DBInstance + Secret + ConfigMap + Deployment + Service
export { createDatabaseApplicationRgd, DatabaseApplicationRgdArgs } from "./database-application";

// Full-Stack Application with AWS Services
// Creates: Frontend + Backend + S3 + ElastiCache + SQS + NetworkPolicies
export { createFullStackApplicationRgd, FullStackApplicationRgdArgs } from "./fullstack-application";

// Multi-Environment Application
// Creates: Environment-aware Deployment with tier-based resources + monitoring
export { createMultiEnvironmentRgd, MultiEnvironmentRgdArgs } from "./multi-environment";
