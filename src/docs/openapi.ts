const bearerSecurity = [{ bearerAuth: [] }];

const unauthorizedResponse = {
  description: 'Token ausente, invalido o expirado.',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorResponse' },
    },
  },
};

const forbiddenResponse = {
  description: 'El usuario autenticado no tiene permisos para acceder al recurso.',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorResponse' },
    },
  },
};

const notFoundResponse = {
  description: 'Recurso no encontrado.',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorResponse' },
    },
  },
};

const validationErrorResponse = {
  description: 'Payload o parametros invalidos.',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorResponse' },
    },
  },
};

const noContentResponse = {
  description: 'Operacion completada sin contenido.',
};

const jsonRequest = (schema: unknown) => ({
  required: true,
  content: {
    'application/json': {
      schema,
    },
  },
});

const arrayResponse = (schemaRef: string, description = 'Listado obtenido correctamente.') => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'array',
        items: { $ref: schemaRef },
      },
    },
  },
});

const objectResponse = (schemaRef: string, description = 'Operacion completada correctamente.') => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: schemaRef },
    },
  },
});

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'ArreglaYa Backend API',
    version: '0.1.0',
    description:
      'API REST para autenticacion, usuarios, categorias, solicitudes, cotizaciones, reservas, pagos, notificaciones, reseñas y administracion de ArreglaYa.',
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Entorno local',
    },
  ],
  tags: [
    { name: 'Health' },
    { name: 'Auth' },
    { name: 'Users' },
    { name: 'Categories' },
    { name: 'Service requests' },
    { name: 'Quotes' },
    { name: 'Bookings' },
    { name: 'Professionals' },
    { name: 'Reviews' },
    { name: 'Payments' },
    { name: 'Notifications' },
    { name: 'Admin' },
    { name: 'Docs' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Verifica que la API este operativa.',
        responses: {
          '200': objectResponse('#/components/schemas/HealthResponse'),
        },
      },
    },
    '/docs': {
      get: {
        tags: ['Docs'],
        summary: 'Interfaz Swagger UI.',
        responses: {
          '200': {
            description: 'HTML de Swagger UI.',
            content: {
              'text/html': {
                schema: { type: 'string' },
              },
            },
          },
        },
      },
    },
    '/docs/openapi.json': {
      get: {
        tags: ['Docs'],
        summary: 'Documento OpenAPI en JSON.',
        responses: {
          '200': {
            description: 'Spec OpenAPI 3.0.3.',
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Registra un cliente o profesional y crea sesion.',
        requestBody: jsonRequest({ $ref: '#/components/schemas/RegisterRequest' }),
        responses: {
          '201': objectResponse('#/components/schemas/AuthSession'),
          '400': validationErrorResponse,
          '409': objectResponse('#/components/schemas/ErrorResponse', 'Email ya registrado.'),
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Inicia sesion con email y contraseña.',
        requestBody: jsonRequest({ $ref: '#/components/schemas/LoginRequest' }),
        responses: {
          '200': objectResponse('#/components/schemas/AuthSession'),
          '400': validationErrorResponse,
          '401': unauthorizedResponse,
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Renueva tokens usando un refresh token vigente.',
        requestBody: jsonRequest({ $ref: '#/components/schemas/RefreshRequest' }),
        responses: {
          '200': objectResponse('#/components/schemas/TokenPair'),
          '400': validationErrorResponse,
          '401': unauthorizedResponse,
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Invalida un refresh token.',
        requestBody: jsonRequest({ $ref: '#/components/schemas/RefreshRequest' }),
        responses: {
          '204': noContentResponse,
        },
      },
    },
    '/me': {
      get: {
        tags: ['Users'],
        security: bearerSecurity,
        summary: 'Obtiene el perfil autenticado.',
        responses: {
          '200': objectResponse('#/components/schemas/User'),
          '401': unauthorizedResponse,
        },
      },
      patch: {
        tags: ['Users'],
        security: bearerSecurity,
        summary: 'Actualiza el perfil autenticado.',
        requestBody: jsonRequest({ $ref: '#/components/schemas/ProfileUpdateRequest' }),
        responses: {
          '200': objectResponse('#/components/schemas/User'),
          '400': validationErrorResponse,
          '401': unauthorizedResponse,
        },
      },
    },
    '/users': {
      get: {
        tags: ['Users'],
        security: bearerSecurity,
        summary: 'Lista usuarios. Requiere rol admin.',
        parameters: [
          {
            name: 'role',
            in: 'query',
            schema: { $ref: '#/components/schemas/PublicRole' },
          },
        ],
        responses: {
          '200': arrayResponse('#/components/schemas/User'),
          '401': unauthorizedResponse,
          '403': forbiddenResponse,
        },
      },
      post: {
        tags: ['Users'],
        security: bearerSecurity,
        summary: 'Crea un usuario desde administracion.',
        requestBody: jsonRequest({ $ref: '#/components/schemas/CreateUserRequest' }),
        responses: {
          '201': objectResponse('#/components/schemas/User'),
          '400': validationErrorResponse,
          '401': unauthorizedResponse,
          '403': forbiddenResponse,
          '409': objectResponse('#/components/schemas/ErrorResponse', 'Email ya registrado.'),
        },
      },
    },
    '/users/{id}': {
      get: {
        tags: ['Users'],
        security: bearerSecurity,
        summary: 'Obtiene un usuario por id.',
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': objectResponse('#/components/schemas/User'),
          '401': unauthorizedResponse,
          '403': forbiddenResponse,
          '404': notFoundResponse,
        },
      },
      patch: {
        tags: ['Users'],
        security: bearerSecurity,
        summary: 'Actualiza un usuario.',
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        requestBody: jsonRequest({ $ref: '#/components/schemas/AdminUserUpdateRequest' }),
        responses: {
          '200': objectResponse('#/components/schemas/User'),
          '400': validationErrorResponse,
          '401': unauthorizedResponse,
          '403': forbiddenResponse,
          '404': notFoundResponse,
          '409': objectResponse('#/components/schemas/ErrorResponse', 'Email en uso.'),
        },
      },
      delete: {
        tags: ['Users'],
        security: bearerSecurity,
        summary: 'Elimina un usuario. Requiere rol admin.',
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '204': noContentResponse,
          '401': unauthorizedResponse,
          '403': forbiddenResponse,
          '404': notFoundResponse,
          '409': objectResponse('#/components/schemas/ErrorResponse', 'Usuario con datos relacionados.'),
        },
      },
    },
    '/categories': {
      get: {
        tags: ['Categories'],
        summary: 'Lista categorias publicas.',
        responses: { '200': arrayResponse('#/components/schemas/Category') },
      },
      post: {
        tags: ['Categories'],
        security: bearerSecurity,
        summary: 'Crea una categoria. Requiere rol admin.',
        requestBody: jsonRequest({ $ref: '#/components/schemas/CategoryWriteRequest' }),
        responses: {
          '201': objectResponse('#/components/schemas/Category'),
          '400': validationErrorResponse,
          '401': unauthorizedResponse,
          '403': forbiddenResponse,
          '409': objectResponse('#/components/schemas/ErrorResponse', 'Slug en uso.'),
        },
      },
    },
    '/categories/{id}': {
      get: {
        tags: ['Categories'],
        summary: 'Obtiene una categoria.',
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': objectResponse('#/components/schemas/Category'),
          '404': notFoundResponse,
        },
      },
      patch: {
        tags: ['Categories'],
        security: bearerSecurity,
        summary: 'Actualiza una categoria. Requiere rol admin.',
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        requestBody: jsonRequest({ $ref: '#/components/schemas/CategoryWriteRequest' }),
        responses: {
          '200': objectResponse('#/components/schemas/Category'),
          '400': validationErrorResponse,
          '401': unauthorizedResponse,
          '403': forbiddenResponse,
          '404': notFoundResponse,
          '409': objectResponse('#/components/schemas/ErrorResponse', 'Slug en uso.'),
        },
      },
      delete: {
        tags: ['Categories'],
        security: bearerSecurity,
        summary: 'Elimina una categoria. Requiere rol admin.',
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '204': noContentResponse,
          '401': unauthorizedResponse,
          '403': forbiddenResponse,
          '404': notFoundResponse,
          '409': objectResponse('#/components/schemas/ErrorResponse', 'Categoria con relaciones.'),
        },
      },
    },
    '/service-requests': {
      get: {
        tags: ['Service requests'],
        security: bearerSecurity,
        summary: 'Lista solicitudes segun el rol autenticado.',
        responses: {
          '200': arrayResponse('#/components/schemas/ServiceRequest'),
          '401': unauthorizedResponse,
        },
      },
      post: {
        tags: ['Service requests'],
        security: bearerSecurity,
        summary: 'Crea una solicitud de servicio.',
        requestBody: jsonRequest({ $ref: '#/components/schemas/ServiceRequestWriteRequest' }),
        responses: {
          '201': objectResponse('#/components/schemas/ServiceRequest'),
          '400': validationErrorResponse,
          '401': unauthorizedResponse,
          '403': forbiddenResponse,
          '404': notFoundResponse,
        },
      },
    },
    '/service-requests/{id}': {
      get: {
        tags: ['Service requests'],
        security: bearerSecurity,
        summary: 'Obtiene una solicitud de servicio.',
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': objectResponse('#/components/schemas/ServiceRequest'),
          '401': unauthorizedResponse,
          '404': notFoundResponse,
        },
      },
      patch: {
        tags: ['Service requests'],
        security: bearerSecurity,
        summary: 'Actualiza una solicitud de servicio.',
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        requestBody: jsonRequest({ $ref: '#/components/schemas/ServiceRequestUpdateRequest' }),
        responses: {
          '200': objectResponse('#/components/schemas/ServiceRequest'),
          '400': validationErrorResponse,
          '401': unauthorizedResponse,
          '403': forbiddenResponse,
          '404': notFoundResponse,
        },
      },
    },
    '/quotes/me': {
      get: {
        tags: ['Quotes'],
        security: bearerSecurity,
        summary: 'Lista cotizaciones del profesional autenticado o todas para admin.',
        responses: {
          '200': arrayResponse('#/components/schemas/Quote'),
          '401': unauthorizedResponse,
          '403': forbiddenResponse,
        },
      },
    },
    '/service-requests/{id}/quotes': {
      post: {
        tags: ['Quotes'],
        security: bearerSecurity,
        summary: 'Crea una cotizacion para una solicitud.',
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        requestBody: jsonRequest({ $ref: '#/components/schemas/CreateQuoteRequest' }),
        responses: {
          '201': objectResponse('#/components/schemas/Quote'),
          '400': validationErrorResponse,
          '401': unauthorizedResponse,
          '403': forbiddenResponse,
          '404': notFoundResponse,
          '409': objectResponse('#/components/schemas/ErrorResponse', 'Cotizacion duplicada.'),
        },
      },
    },
    '/bookings': {
      get: {
        tags: ['Bookings'],
        security: bearerSecurity,
        summary: 'Lista reservas segun el rol autenticado.',
        responses: {
          '200': arrayResponse('#/components/schemas/Booking'),
          '401': unauthorizedResponse,
        },
      },
      post: {
        tags: ['Bookings'],
        security: bearerSecurity,
        summary: 'Crea una reserva para una solicitud.',
        requestBody: jsonRequest({ $ref: '#/components/schemas/CreateBookingRequest' }),
        responses: {
          '201': objectResponse('#/components/schemas/Booking'),
          '400': validationErrorResponse,
          '401': unauthorizedResponse,
          '403': forbiddenResponse,
          '404': notFoundResponse,
          '409': objectResponse('#/components/schemas/ErrorResponse', 'Reserva en conflicto.'),
        },
      },
    },
    '/bookings/{id}': {
      get: {
        tags: ['Bookings'],
        security: bearerSecurity,
        summary: 'Obtiene una reserva.',
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': objectResponse('#/components/schemas/Booking'),
          '401': unauthorizedResponse,
          '403': forbiddenResponse,
          '404': notFoundResponse,
        },
      },
      patch: {
        tags: ['Bookings'],
        security: bearerSecurity,
        summary: 'Reprograma o cambia estado de una reserva.',
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        requestBody: jsonRequest({ $ref: '#/components/schemas/UpdateBookingRequest' }),
        responses: {
          '200': objectResponse('#/components/schemas/Booking'),
          '400': validationErrorResponse,
          '401': unauthorizedResponse,
          '403': forbiddenResponse,
          '404': notFoundResponse,
          '409': objectResponse('#/components/schemas/ErrorResponse', 'Conflicto de agenda.'),
        },
      },
    },
    '/bookings/{id}/reminders': {
      post: {
        tags: ['Notifications'],
        security: bearerSecurity,
        summary: 'Envia recordatorio push/email al cliente y profesional de una reserva.',
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '202': objectResponse('#/components/schemas/ReminderAccepted'),
          '401': unauthorizedResponse,
          '403': forbiddenResponse,
          '404': notFoundResponse,
        },
      },
    },
    '/professionals/search': {
      get: {
        tags: ['Professionals'],
        summary: 'Busca profesionales por categoria, zona y disponibilidad.',
        parameters: [
          { name: 'categoryId', in: 'query', schema: { type: 'string' } },
          { name: 'categorySlug', in: 'query', schema: { type: 'string' } },
          { name: 'zone', in: 'query', schema: { type: 'string' } },
          { name: 'availableAt', in: 'query', schema: { type: 'string', format: 'date-time' } },
        ],
        responses: {
          '200': arrayResponse('#/components/schemas/ProfessionalSearchResult'),
          '404': notFoundResponse,
        },
      },
    },
    '/emergencies': {
      post: {
        tags: ['Professionals'],
        security: bearerSecurity,
        summary: 'Crea una solicitud urgente y reserva al primer profesional disponible.',
        requestBody: jsonRequest({ $ref: '#/components/schemas/CreateEmergencyRequest' }),
        responses: {
          '201': objectResponse('#/components/schemas/EmergencyResponse'),
          '400': validationErrorResponse,
          '401': unauthorizedResponse,
          '403': forbiddenResponse,
          '404': notFoundResponse,
          '409': objectResponse('#/components/schemas/ErrorResponse', 'No hay profesional disponible.'),
        },
      },
    },
    '/professionals/{id}/reviews': {
      get: {
        tags: ['Reviews'],
        summary: 'Lista reseñas publicas de un profesional.',
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': arrayResponse('#/components/schemas/Review'),
        },
      },
    },
    '/reviews': {
      post: {
        tags: ['Reviews'],
        security: bearerSecurity,
        summary: 'Crea una reseña para una reserva completada.',
        requestBody: jsonRequest({ $ref: '#/components/schemas/CreateReviewRequest' }),
        responses: {
          '201': objectResponse('#/components/schemas/Review'),
          '400': validationErrorResponse,
          '401': unauthorizedResponse,
          '403': forbiddenResponse,
          '404': notFoundResponse,
          '409': objectResponse('#/components/schemas/ErrorResponse', 'Reserva no completada o reseña duplicada.'),
        },
      },
    },
    '/payments': {
      get: {
        tags: ['Payments'],
        security: bearerSecurity,
        summary: 'Lista pagos segun el rol autenticado.',
        responses: {
          '200': arrayResponse('#/components/schemas/Payment'),
          '401': unauthorizedResponse,
        },
      },
    },
    '/payments/{id}': {
      get: {
        tags: ['Payments'],
        security: bearerSecurity,
        summary: 'Obtiene un pago.',
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': objectResponse('#/components/schemas/Payment'),
          '401': unauthorizedResponse,
          '403': forbiddenResponse,
          '404': notFoundResponse,
        },
      },
    },
    '/payments/{id}/receipt': {
      get: {
        tags: ['Payments'],
        security: bearerSecurity,
        summary: 'Obtiene el comprobante de un pago aprobado.',
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': objectResponse('#/components/schemas/PaymentReceipt'),
          '401': unauthorizedResponse,
          '403': forbiddenResponse,
          '404': notFoundResponse,
          '409': objectResponse('#/components/schemas/ErrorResponse', 'Comprobante no disponible.'),
        },
      },
    },
    '/bookings/{id}/payments': {
      post: {
        tags: ['Payments'],
        security: bearerSecurity,
        summary: 'Crea una preferencia de pago para una reserva.',
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        requestBody: jsonRequest({ $ref: '#/components/schemas/CreatePaymentRequest' }),
        responses: {
          '201': objectResponse('#/components/schemas/Payment'),
          '400': validationErrorResponse,
          '401': unauthorizedResponse,
          '403': forbiddenResponse,
          '404': notFoundResponse,
          '409': objectResponse('#/components/schemas/ErrorResponse', 'Reserva no pagable o pago duplicado.'),
          '502': objectResponse('#/components/schemas/ErrorResponse', 'Error de pasarela.'),
        },
      },
    },
    '/payments/webhooks/mercadopago': {
      post: {
        tags: ['Payments'],
        summary: 'Webhook de MercadoPago para actualizar estado de pagos.',
        requestBody: jsonRequest({ $ref: '#/components/schemas/MercadoPagoWebhook' }),
        responses: {
          '200': objectResponse('#/components/schemas/Payment'),
          '400': validationErrorResponse,
          '401': unauthorizedResponse,
          '404': notFoundResponse,
        },
      },
    },
    '/notifications': {
      get: {
        tags: ['Notifications'],
        security: bearerSecurity,
        summary: 'Lista notificaciones del usuario autenticado.',
        parameters: [
          {
            name: 'unread',
            in: 'query',
            schema: { type: 'string', enum: ['true', 'false'] },
          },
        ],
        responses: {
          '200': arrayResponse('#/components/schemas/Notification'),
          '401': unauthorizedResponse,
        },
      },
    },
    '/notifications/{id}/read': {
      patch: {
        tags: ['Notifications'],
        security: bearerSecurity,
        summary: 'Marca una notificacion como leida.',
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': objectResponse('#/components/schemas/Notification'),
          '401': unauthorizedResponse,
          '403': forbiddenResponse,
          '404': notFoundResponse,
        },
      },
    },
    '/admin/users': {
      get: {
        tags: ['Admin'],
        security: bearerSecurity,
        summary: 'Lista usuarios con metadatos de administracion.',
        responses: {
          '200': arrayResponse('#/components/schemas/AdminUser'),
          '401': unauthorizedResponse,
          '403': forbiddenResponse,
        },
      },
    },
    '/admin/service-requests': {
      get: {
        tags: ['Admin'],
        security: bearerSecurity,
        summary: 'Lista todas las solicitudes de servicio para administracion.',
        responses: {
          '200': arrayResponse('#/components/schemas/ServiceRequest'),
          '401': unauthorizedResponse,
          '403': forbiddenResponse,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    parameters: {
      IdPath: {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' },
      },
    },
    schemas: {
      PublicRole: {
        type: 'string',
        enum: ['cliente', 'profesional', 'admin'],
      },
      HealthResponse: {
        type: 'object',
        required: ['status', 'service', 'timestamp'],
        properties: {
          status: { type: 'string', example: 'ok' },
          service: { type: 'string', example: 'arreglaya-backend' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      ErrorResponse: {
        type: 'object',
        required: ['message', 'code'],
        properties: {
          message: { type: 'string' },
          code: { type: 'string' },
          issues: { type: 'array', items: { type: 'object' } },
        },
      },
      TokenPair: {
        type: 'object',
        required: ['accessToken', 'refreshToken'],
        properties: {
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
        },
      },
      AuthSession: {
        allOf: [
          { $ref: '#/components/schemas/TokenPair' },
          {
            type: 'object',
            required: ['user'],
            properties: {
              user: { $ref: '#/components/schemas/User' },
            },
          },
        ],
      },
      RegisterRequest: {
        type: 'object',
        required: ['email', 'password', 'fullName'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
          fullName: { type: 'string', minLength: 3 },
          role: { type: 'string', enum: ['cliente', 'profesional'], default: 'cliente' },
          city: { type: 'string' },
          zone: { type: 'string' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
        },
      },
      RefreshRequest: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' },
        },
      },
      User: {
        type: 'object',
        required: ['id', 'email', 'fullName', 'role'],
        properties: {
          id: { type: 'string' },
          email: { type: 'string', format: 'email' },
          fullName: { type: 'string' },
          role: { $ref: '#/components/schemas/PublicRole' },
          city: { type: 'string' },
          zone: { type: 'string' },
          ratingAverage: { type: 'number' },
          ratingCount: { type: 'integer' },
        },
      },
      AdminUser: {
        allOf: [
          { $ref: '#/components/schemas/User' },
          {
            type: 'object',
            properties: {
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        ],
      },
      CreateUserRequest: {
        allOf: [{ $ref: '#/components/schemas/RegisterRequest' }],
      },
      ProfileUpdateRequest: {
        type: 'object',
        properties: {
          fullName: { type: 'string', minLength: 3 },
          city: { type: 'string' },
          zone: { type: 'string' },
        },
      },
      AdminUserUpdateRequest: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
          role: { type: 'string', enum: ['cliente', 'profesional'] },
          fullName: { type: 'string', minLength: 3 },
          city: { type: 'string' },
          zone: { type: 'string' },
        },
      },
      Category: {
        type: 'object',
        required: ['id', 'name', 'slug'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          slug: { type: 'string' },
        },
      },
      CategoryWriteRequest: {
        type: 'object',
        required: ['name', 'slug'],
        properties: {
          name: { type: 'string' },
          slug: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
        },
      },
      ServiceRequest: {
        type: 'object',
        required: ['id', 'title', 'description', 'status', 'category', 'city', 'zone', 'createdAt'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          status: {
            type: 'string',
            enum: ['draft', 'open', 'quoted', 'assigned', 'cancelled'],
          },
          category: { $ref: '#/components/schemas/Category' },
          city: { type: 'string' },
          zone: { type: 'string' },
          budget: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ServiceRequestWriteRequest: {
        type: 'object',
        required: ['title', 'description', 'categoryId', 'city', 'zone'],
        properties: {
          title: { type: 'string', minLength: 4 },
          description: { type: 'string', minLength: 12 },
          categoryId: { type: 'string' },
          city: { type: 'string' },
          zone: { type: 'string' },
          budget: { type: 'string' },
        },
      },
      ServiceRequestUpdateRequest: {
        allOf: [
          { $ref: '#/components/schemas/ServiceRequestWriteRequest' },
          {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['draft', 'open', 'quoted', 'assigned', 'cancelled'],
              },
            },
          },
        ],
      },
      Quote: {
        type: 'object',
        required: ['id', 'serviceRequestId', 'professionalId', 'professionalName', 'amount', 'status', 'message', 'createdAt'],
        properties: {
          id: { type: 'string' },
          serviceRequestId: { type: 'string' },
          professionalId: { type: 'string' },
          professionalName: { type: 'string' },
          amount: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'accepted', 'rejected', 'withdrawn'] },
          message: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateQuoteRequest: {
        type: 'object',
        required: ['amount', 'message'],
        properties: {
          amount: { type: 'string' },
          message: { type: 'string', minLength: 10 },
        },
      },
      Booking: {
        type: 'object',
        required: ['id', 'serviceRequestId', 'serviceRequestTitle', 'clientId', 'clientName', 'professionalId', 'professionalName', 'scheduledAt', 'status', 'createdAt'],
        properties: {
          id: { type: 'string' },
          serviceRequestId: { type: 'string' },
          serviceRequestTitle: { type: 'string' },
          clientId: { type: 'string' },
          clientName: { type: 'string' },
          professionalId: { type: 'string' },
          professionalName: { type: 'string' },
          scheduledAt: { type: 'string', format: 'date-time' },
          status: { type: 'string', enum: ['pending', 'confirmed', 'completed', 'cancelled'] },
          notes: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateBookingRequest: {
        type: 'object',
        required: ['serviceRequestId', 'professionalId', 'scheduledAt'],
        properties: {
          serviceRequestId: { type: 'string' },
          professionalId: { type: 'string' },
          scheduledAt: { type: 'string', format: 'date-time' },
          notes: { type: 'string', minLength: 3 },
        },
      },
      UpdateBookingRequest: {
        type: 'object',
        properties: {
          scheduledAt: { type: 'string', format: 'date-time' },
          status: { type: 'string', enum: ['pending', 'confirmed', 'completed', 'cancelled'] },
          notes: { type: 'string', minLength: 3 },
        },
      },
      ProfessionalSearchResult: {
        allOf: [
          { $ref: '#/components/schemas/User' },
          {
            type: 'object',
            required: ['available', 'specialties'],
            properties: {
              available: { type: 'boolean' },
              specialties: {
                type: 'array',
                items: { $ref: '#/components/schemas/Category' },
              },
            },
          },
        ],
      },
      CreateEmergencyRequest: {
        allOf: [
          { $ref: '#/components/schemas/ServiceRequestWriteRequest' },
          {
            type: 'object',
            properties: {
              scheduledAt: { type: 'string', format: 'date-time' },
              notes: { type: 'string' },
            },
          },
        ],
      },
      EmergencyResponse: {
        type: 'object',
        required: ['serviceRequest', 'booking'],
        properties: {
          serviceRequest: { $ref: '#/components/schemas/ServiceRequest' },
          booking: { $ref: '#/components/schemas/Booking' },
        },
      },
      Review: {
        type: 'object',
        required: ['id', 'bookingId', 'serviceRequestId', 'clientId', 'clientName', 'professionalId', 'professionalName', 'rating', 'createdAt'],
        properties: {
          id: { type: 'string' },
          bookingId: { type: 'string' },
          serviceRequestId: { type: 'string' },
          clientId: { type: 'string' },
          clientName: { type: 'string' },
          professionalId: { type: 'string' },
          professionalName: { type: 'string' },
          rating: { type: 'integer', minimum: 1, maximum: 5 },
          comment: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateReviewRequest: {
        type: 'object',
        required: ['bookingId', 'rating'],
        properties: {
          bookingId: { type: 'string' },
          rating: { type: 'integer', minimum: 1, maximum: 5 },
          comment: { type: 'string', minLength: 3 },
        },
      },
      Payment: {
        type: 'object',
        required: ['id', 'bookingId', 'serviceRequestId', 'serviceRequestTitle', 'professionalId', 'professionalName', 'amountCents', 'currency', 'status', 'provider', 'createdAt'],
        properties: {
          id: { type: 'string' },
          bookingId: { type: 'string' },
          serviceRequestId: { type: 'string' },
          serviceRequestTitle: { type: 'string' },
          professionalId: { type: 'string' },
          professionalName: { type: 'string' },
          amountCents: { type: 'integer', minimum: 1 },
          currency: { type: 'string', example: 'ARS' },
          status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'cancelled', 'refunded'] },
          provider: { type: 'string', enum: ['mercado_pago'] },
          checkoutUrl: { type: 'string', format: 'uri' },
          receiptNumber: { type: 'string' },
          paidAt: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      CreatePaymentRequest: {
        type: 'object',
        required: ['amountCents'],
        properties: {
          amountCents: { type: 'integer', minimum: 1 },
          currency: { type: 'string', minLength: 3, maxLength: 3, default: 'ARS' },
          description: { type: 'string', minLength: 4 },
        },
      },
      PaymentReceipt: {
        type: 'object',
        required: ['receiptNumber', 'paymentId', 'bookingId', 'serviceRequestTitle', 'professionalName', 'amountCents', 'currency', 'paidAt'],
        properties: {
          receiptNumber: { type: 'string' },
          paymentId: { type: 'string' },
          bookingId: { type: 'string' },
          serviceRequestTitle: { type: 'string' },
          professionalName: { type: 'string' },
          amountCents: { type: 'integer' },
          currency: { type: 'string' },
          paidAt: { type: 'string', format: 'date-time' },
        },
      },
      MercadoPagoWebhook: {
        type: 'object',
        properties: {
          externalId: { type: 'string' },
          externalReference: { type: 'string' },
          external_reference: { type: 'string' },
          status: {
            type: 'string',
            enum: ['pending', 'approved', 'rejected', 'cancelled', 'canceled', 'refunded'],
          },
          data: {
            type: 'object',
            properties: {
              id: { oneOf: [{ type: 'string' }, { type: 'number' }] },
            },
          },
        },
      },
      Notification: {
        type: 'object',
        required: ['id', 'type', 'channel', 'status', 'title', 'body', 'recipientId', 'createdAt'],
        properties: {
          id: { type: 'string' },
          type: {
            type: 'string',
            enum: ['booking_created', 'booking_confirmed', 'booking_reminder', 'booking_status_changed'],
          },
          channel: { type: 'string', enum: ['push', 'email'] },
          status: { type: 'string', enum: ['pending', 'sent', 'failed'] },
          title: { type: 'string' },
          body: { type: 'string' },
          recipientId: { type: 'string' },
          bookingId: { type: 'string' },
          metadata: { type: 'object', additionalProperties: true },
          readAt: { type: 'string', format: 'date-time' },
          sentAt: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ReminderAccepted: {
        type: 'object',
        required: ['sent', 'bookingId'],
        properties: {
          sent: { type: 'boolean' },
          bookingId: { type: 'string' },
        },
      },
    },
  },
} as const;
