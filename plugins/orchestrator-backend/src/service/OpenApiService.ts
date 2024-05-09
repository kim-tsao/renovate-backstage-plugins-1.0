import { DiscoveryApi } from '@backstage/core-plugin-api';

import { Logger } from 'winston';

import openApiTemplate from './openapi-template.json';

export class OpenApiService {
  logger: Logger;
  discovery: DiscoveryApi;

  constructor(logger: Logger, discovery: DiscoveryApi) {
    this.logger = logger;
    this.discovery = discovery;
  }

  private async fetchScaffolderActions(): Promise<any> {
    const scaffolderUrl = await this.discovery.getBaseUrl('scaffolder');
    return fetch(`${scaffolderUrl}/v2/actions`).then(res => {
      return res.json();
    });
  }

  async generateOpenApi(): Promise<any> {
    const template = { ...openApiTemplate };
    return this.fetchScaffolderActions()
      .then(actions => {
        template.paths = this.mapPaths(actions);
        return actions;
      })
      .then(actions => this.mapSchemas(actions))
      .then(schemas => {
        template.components.schemas = schemas;
        return template;
      })
      .catch(err => {
        this.logger.error(err);
      });
  }

  private mapPaths(actions: any): any {
    const paths: any = {};
    for (const action of actions) {
      const actionId: string = action.id;
      const description = action.description;
      const schemaName = this.generateSchemaName(actionId);

      const path = `/actions/${actionId}`;
      paths[path] = {
        post: {
          operationId: actionId,
          description: description,
          requestBody: {
            description: `Input parameters for the action ${actionId} in BS`,
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: `#/components/schemas/${schemaName}`,
                },
              },
            },
          },
          responses: {
            default: {
              description: `Action ${actionId} response`,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                  },
                },
              },
            },
          },
        },
      };
    }
    return paths;
  }

  private deleteInvalidPropertiesDfs(object: any): void {
    if (
      !object ||
      Object.prototype.toString.call(object) !== '[object Object]'
    ) {
      return;
    }
    Object.entries(object).forEach(([k, v]) => {
      const invalidConstProperty = k === 'const' && v === '*';
      const invalidTypeArray = k === 'type' && v === 'array' && !object.items;
      if (invalidConstProperty) {
        delete object[k];
      } else if (invalidTypeArray) {
        // invalid array type that does not contain items property fallback to string
        object[k] = 'string';
      } else {
        this.deleteInvalidPropertiesDfs(object[k]);
      }
    });
  }

  private mapSchemas(actions: any): any {
    const schemas: any = {};

    for (const action of actions) {
      const actionId: string = action.id;
      const schema = action.schema;
      const input = schema.input;
      const schemaName = this.generateSchemaName(actionId);

      // removing invalid attribute
      delete input.$schema;

      this.deleteInvalidPropertiesDfs(input);

      if (input.properties) {
        Object.keys(input.properties).forEach(key => {
          const prop = input.properties[key];
          if (prop && Array.isArray(prop.type)) {
            // type: [string, boolean] is invalid
            prop.type = prop.type.pop();
          }
        });
      }

      schemas[schemaName] = input;
    }
    return schemas;
  }

  private generateSchemaName(actionId: string): string {
    return actionId?.replaceAll(':', '_') ?? actionId;
  }
}
