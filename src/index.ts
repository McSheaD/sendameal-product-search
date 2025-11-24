import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Define interface for environment bindings
interface Env {
  AI: any; // Cloudflare AI binding for AI Search
}

// SendaMeal MCP Server - Exposes product search and recommendation tools
export class SendaMealMCP extends McpAgent<Env> {
  server = new McpServer({
    name: "SendaMeal Product Search",
    version: "1.0.0",
  });

  async init() {
    // Tool 1: Search products using AI Search
    this.server.tool(
      "search_products",
      {
        query: z.string().describe("Search query for finding meal products"),
        max_results: z.number().optional().default(10).describe("Maximum number of results to return"),
      },
      async ({ query, max_results }) => {
        try {
          // Use AI Search AutoRAG to query the product index
          const results = await this.env.AI.autorag({
            index: "cool-bush-e0f4", // Using the largest index with 609 pages
            query: query,
            maxResults: max_results,
          });

          if (!results || !results.results || results.results.length === 0) {
            return {
              content: [{
                type: "text",
                text: `No products found for query: "${query}"`
              }]
            };
          }

          // Format the results
          const formattedResults = results.results.map((item: any, index: number) => {
            return `${index + 1}. ${item.title || 'Untitled'}\n   URL: ${item.url || 'N/A'}\n   ${item.snippet || 'No description available'}`;
          }).join('\n\n');

          return {
            content: [{
              type: "text",
              text: `Found ${results.results.length} products:\n\n${formattedResults}`
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error searching products: ${error.message}`
            }]
          };
        }
      }
    );

    // Tool 2: Get product details by name or URL
    this.server.tool(
      "get_product_details",
      {
        product_name: z.string().describe("Name or search term for the specific product"),
      },
      async ({ product_name }) => {
        try {
          const results = await this.env.AI.autorag({
            index: "cool-bush-e0f4",
            query: product_name,
            maxResults: 3,
          });

          if (!results || !results.results || results.results.length === 0) {
            return {
              content: [{
                type: "text",
                text: `Product not found: "${product_name}"`
              }]
            };
          }

          const product = results.results[0];
          const details = `Product: ${product.title || 'Untitled'}\nURL: ${product.url || 'N/A'}\n\nDescription:\n${product.content || product.snippet || 'No description available'}`;

          return {
            content: [{
              type: "text",
              text: details
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error fetching product details: ${error.message}`
            }]
          };
        }
      }
    );

    // Tool 3: Find products by dietary restrictions
    this.server.tool(
      "find_dietary_options",
      {
        dietary_restriction: z.string().describe("Dietary restriction (e.g., 'gluten-free', 'vegan', 'kosher', 'dairy-free')"),
        meal_type: z.string().optional().describe("Optional meal type filter (e.g., 'breakfast', 'dinner', 'dessert')"),
      },
      async ({ dietary_restriction, meal_type }) => {
        try {
          let query = dietary_restriction;
          if (meal_type) {
            query += ` ${meal_type}`;
          }

          const results = await this.env.AI.autorag({
            index: "cool-bush-e0f4",
            query: query,
            maxResults: 10,
          });

          if (!results || !results.results || results.results.length === 0) {
            return {
              content: [{
                type: "text",
                text: `No ${dietary_restriction} products found${meal_type ? ` for ${meal_type}` : ''}`
              }]
            };
          }

          const formattedResults = results.results.map((item: any, index: number) => {
            return `${index + 1}. ${item.title || 'Untitled'}\n   ${item.url || 'N/A'}`;
          }).join('\n\n');

          return {
            content: [{
              type: "text",
              text: `Found ${results.results.length} ${dietary_restriction} products${meal_type ? ` for ${meal_type}` : ''}:\n\n${formattedResults}`
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error finding dietary options: ${error.message}`
            }]
          };
        }
      }
    );

    // Tool 4: Get recommendations based on occasion
    this.server.tool(
      "get_recommendations",
      {
        occasion: z.string().describe("The occasion or event (e.g., 'birthday', 'sympathy', 'get well', 'thank you')"),
        preferences: z.string().optional().describe("Additional preferences or requirements"),
      },
      async ({ occasion, preferences }) => {
        try {
          let query = `${occasion} gift meal`;
          if (preferences) {
            query += ` ${preferences}`;
          }

          const results = await this.env.AI.autorag({
            index: "cool-bush-e0f4",
            query: query,
            maxResults: 5,
          });

          if (!results || !results.results || results.results.length === 0) {
            return {
              content: [{
                type: "text",
                text: `No recommendations found for ${occasion}`
              }]
            };
          }

          const formattedResults = results.results.map((item: any, index: number) => {
            return `${index + 1}. ${item.title || 'Untitled'}\n   ${item.url || 'N/A'}\n   ${item.snippet || ''}`;
          }).join('\n\n');

          return {
            content: [{
              type: "text",
              text: `Top recommendations for ${occasion}${preferences ? ` (${preferences})` : ''}:\n\n${formattedResults}`
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error getting recommendations: ${error.message}`
            }]
          };
        }
      }
    );
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    
    // SSE endpoint for MCP clients
    if (url.pathname === "/sse" || url.pathname === "/sse/message") {
      return SendaMealMCP.serveSSE("/sse").fetch(request, env, ctx);
    }
    
    // WebSocket endpoint for MCP clients
    if (url.pathname === "/mcp") {
      return SendaMealMCP.serve("/mcp").fetch(request, env, ctx);
    }
    
    // Health check endpoint
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(JSON.stringify({
        name: "SendaMeal MCP Server",
        version: "1.0.0",
        status: "healthy",
        endpoints: {
          sse: "/sse",
          mcp: "/mcp"
        }
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    
    return new Response("Not found", { status: 404 });
  },
};
