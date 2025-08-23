import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Application } from 'express';
import path from 'path';
import fs from 'fs';

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'WhatsApp Integration API',
      version: '1.0.0',
      description: `
        A comprehensive WhatsApp integration service that enables users to manage WhatsApp device sessions through WPPConnect and send messages programmatically.
        
        ## Features
        - Multi-tenant WhatsApp session management
        - Real-time QR code generation and device pairing
        - Message sending (text, media, location, etc.)
        - Webhook notifications for events
        - Socket.IO real-time updates
        - Two-factor authentication
        - API key management
        - Comprehensive audit logging
        
        ## Authentication
        This API supports two authentication methods:
        1. **JWT Bearer Token** - For user authentication
        2. **API Key** - For programmatic access (use \`X-API-Key\` header)
      `,
      contact: {
        name: 'WhatsApp Integration Support',
        email: 'support@whatsapp-integration.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: `http://82.29.198.95:7811/api/v1`,
        description: 'Production server',
      },
      {
        url: 'http://localhost:7811/api/v1',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
        },
      },
    },
    security: [
      {
        BearerAuth: [],
      },
      {
        ApiKeyAuth: [],
      },
    ],
  },
  apis: [
    path.join(__dirname, '../routes/*.ts'),
    path.join(__dirname, '../controllers/*.ts'),
    path.join(__dirname, '../models/*.ts'),
  ],
};

// Try to load the existing OpenAPI spec if available
const openApiPath = path.join(__dirname, '../docs/api/openapi.yaml');
let spec: any;

try {
  if (fs.existsSync(openApiPath)) {
    // If we have the full OpenAPI spec, use it
    const yaml = require('js-yaml');
    const yamlContent = fs.readFileSync(openApiPath, 'utf8');
    spec = yaml.load(yamlContent);

    // Update server URLs for production
    if (spec.servers) {
      spec.servers = [
        {
          url: `http://82.29.198.95:7811/api/v1`,
          description: 'Production server',
        },
        {
          url: 'http://localhost:7811/api/v1',
          description: 'Development server',
        },
      ];
    }
    console.log('✅ Loaded OpenAPI specification from docs/api/openapi.yaml');
  } else {
    // Fallback to generated spec
    console.log('📚 Using generated OpenAPI specification (docs folder not available)');
    spec = swaggerJSDoc(options);
  }
} catch (error) {
  console.warn('⚠️  Could not load OpenAPI spec from YAML, using generated spec:', error.message);
  spec = swaggerJSDoc(options);
}

const swaggerUiOptions = {
  customCss: `
    .topbar-wrapper img { 
      display: none; 
    }
    .topbar-wrapper .link:after { 
      content: "WhatsApp Integration API"; 
      color: #25D366;
      font-weight: bold;
    }
    .swagger-ui .topbar { 
      background-color: #128C7E; 
    }
    .swagger-ui .info .title { 
      color: #25D366; 
    }
  `,
  customSiteTitle: 'WhatsApp Integration API Documentation',
  customfavIcon: '/favicon.ico',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    tryItOutEnabled: true,
  },
};

export const setupSwagger = (app: Application): void => {
  // Swagger UI
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec, swaggerUiOptions));

  // Raw OpenAPI JSON
  app.get('/api/docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(spec);
  });

  // Postman collection
  app.get('/api/postman', (_req, res) => {
    try {
      const postmanPath = path.join(
        __dirname,
        '../docs/postman/WhatsApp-Integration-API.postman_collection.json'
      );
      if (fs.existsSync(postmanPath)) {
        const postmanCollection = JSON.parse(fs.readFileSync(postmanPath, 'utf8'));

        // Update URLs to production
        const updateUrls = (items: any[]) => {
          items.forEach((item) => {
            if (item.request && item.request.url) {
              if (typeof item.request.url === 'string') {
                item.request.url = item.request.url.replace(
                  'http://localhost:3001',
                  'http://82.29.198.95:7811'
                );
              } else if (item.request.url.raw) {
                item.request.url.raw = item.request.url.raw.replace(
                  'http://localhost:3001',
                  'http://82.29.198.95:7811'
                );
              }
            }
            if (item.item) {
              updateUrls(item.item);
            }
          });
        };

        if (postmanCollection.item) {
          updateUrls(postmanCollection.item);
        }

        res.setHeader('Content-Type', 'application/json');
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="WhatsApp-Integration-API.postman_collection.json"'
        );
        res.send(postmanCollection);
      } else {
        res.status(404).json({
          error: 'Postman collection not found',
          message:
            'The Postman collection is not available in this deployment. Please download from the repository.',
          repository: 'https://github.com/your-repo/docs/postman/',
        });
      }
    } catch (error) {
      console.error('Error loading Postman collection:', error.message);
      res.status(500).json({
        error: 'Error loading Postman collection',
        message: error.message,
      });
    }
  });

  // API info endpoint
  app.get('/api/info', (_req, res) => {
    res.json({
      name: 'WhatsApp Integration API',
      version: '1.0.0',
      description: 'WhatsApp Business Integration Platform',
      documentation: {
        swagger: '/api/docs',
        openapi: '/api/docs.json',
        postman: '/api/postman',
      },
      endpoints: {
        auth: '/api/v1/auth',
        sessions: '/api/v1/sessions',
        messages: '/api/v1/messages',
        webhooks: '/api/v1/webhooks',
        events: '/api/v1/events',
      },
      health: '/health',
      status: 'running',
      timestamp: new Date().toISOString(),
    });
  });
};
