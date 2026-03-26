import { createSwaggerSpec } from "next-swagger-doc";

export const getApiDocs = () => {
  const spec = createSwaggerSpec({
    apiFolder: "src/app/api",
    definition: {
      openapi: "3.0.0",
      info: {
        title: "Golfapalooza API",
        version: "1.0.0",
        description: "API documentation for Golfapalooza golf scoring application",
        contact: {
          name: "Golfapalooza Support",
        },
      },
      servers: [
        {
          url: process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000",
          description: "API Server",
        },
      ],
      tags: [
        {
          name: "Courses",
          description: "Golf course search and details",
        },
        {
          name: "Rounds",
          description: "Round management and scoring",
        },
        {
          name: "Handicap",
          description: "Handicap calculation and history",
        },
        {
          name: "Auth",
          description: "Authentication endpoints",
        },
        {
          name: "Admin",
          description: "Admin user management",
        },
      ],
      components: {
        securitySchemes: {
          cookieAuth: {
            type: "apiKey",
            in: "cookie",
            name: "sb-access-token",
            description: "Supabase session cookie (automatically set after login)",
          },
        },
        schemas: {
          Error: {
            type: "object",
            properties: {
              error: {
                type: "string",
                description: "Error message",
              },
            },
          },
          Course: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              external_id: { type: "string" },
              name: { type: "string" },
              club_name: { type: "string" },
              city: { type: "string" },
              state: { type: "string" },
              country: { type: "string" },
              hole_count: { type: "integer", enum: [9, 18] },
              latitude: { type: "number" },
              longitude: { type: "number" },
            },
          },
          CourseTee: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              course_id: { type: "string", format: "uuid" },
              tee_name: { type: "string" },
              tee_color: { type: "string" },
              course_rating: { type: "number" },
              slope_rating: { type: "integer" },
              par: { type: "integer" },
              total_yards: { type: "integer" },
            },
          },
          CourseHole: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              hole_number: { type: "integer", minimum: 1, maximum: 18 },
              par: { type: "integer", minimum: 3, maximum: 6 },
              handicap_index: { type: "integer", minimum: 1, maximum: 18 },
              yards: { type: "integer" },
            },
          },
          Round: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              created_by: { type: "string", format: "uuid" },
              course_id: { type: "string", format: "uuid" },
              tee_id: { type: "string", format: "uuid" },
              round_date: { type: "string", format: "date" },
              round_type: { type: "string", enum: ["18", "9-front", "9-back"] },
              status: { type: "string", enum: ["in_progress", "completed", "cancelled"] },
              weather_conditions: { type: "string" },
              notes: { type: "string" },
            },
          },
          RoundPlayer: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              round_id: { type: "string", format: "uuid" },
              user_id: { type: "string", format: "uuid" },
              tee_id: { type: "string", format: "uuid" },
              player_position: { type: "integer" },
              is_scorer: { type: "boolean" },
              playing_handicap: { type: "integer" },
              final_gross_score: { type: "integer" },
              final_adjusted_score: { type: "integer" },
              final_net_score: { type: "integer" },
              score_differential: { type: "number" },
            },
          },
          RoundScore: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              round_player_id: { type: "string", format: "uuid" },
              hole_number: { type: "integer" },
              strokes: { type: "integer" },
              putts: { type: "integer" },
              fairway_hit: { type: "boolean" },
              green_in_regulation: { type: "boolean" },
              penalty_strokes: { type: "integer" },
            },
          },
          PlayerHandicap: {
            type: "object",
            properties: {
              user_id: { type: "string", format: "uuid" },
              handicap_index: { type: "number" },
              low_handicap_index: { type: "number" },
              rounds_used: { type: "integer" },
              last_calculated_at: { type: "string", format: "date-time" },
              effective_date: { type: "string", format: "date" },
            },
          },
          CreateRoundRequest: {
            type: "object",
            required: ["course_id", "tee_id", "round_type"],
            properties: {
              course_id: { type: "string", format: "uuid" },
              tee_id: { type: "string", format: "uuid" },
              round_type: { type: "string", enum: ["18", "9-front", "9-back"] },
              round_date: { type: "string", format: "date" },
              players: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    user_id: { type: "string", format: "uuid" },
                    tee_id: { type: "string", format: "uuid" },
                    is_scorer: { type: "boolean" },
                  },
                },
              },
            },
          },
          ScoreUpdate: {
            type: "object",
            required: ["round_player_id", "hole_number"],
            properties: {
              round_player_id: { type: "string", format: "uuid" },
              hole_number: { type: "integer" },
              strokes: { type: "integer" },
              putts: { type: "integer" },
              fairway_hit: { type: "boolean" },
              green_in_regulation: { type: "boolean" },
              penalty_strokes: { type: "integer" },
            },
          },
        },
      },
      security: [{ cookieAuth: [] }],
    },
  });
  return spec;
};
