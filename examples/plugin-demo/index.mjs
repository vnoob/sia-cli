/**
 * Sample plugin: copy this folder into SIA_HOME/plugins/demo/ or .sia/plugins/demo/
 */
export default async function register(api) {
  api.registerTool({
    name: "demo_hello",
    description: "Return a JSON greeting for the given name.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Who to greet" },
      },
      required: ["name"],
    },
    async handler(args) {
      const name = typeof args?.name === "string" ? args.name : "world";
      return JSON.stringify({ hello: name });
    },
  });
}
