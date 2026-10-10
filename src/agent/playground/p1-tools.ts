//a first tool. Run with: npx tsx src/agent/playground/p1.tools.ts
import { tool } from '@langchain/core/tools';
import { convertToOpenAITool } from '@langchain/core/utils/function_calling';
import { z } from 'zod';
import { data } from '@/data/faculty';

//a tool= our fn+a name+description+input schema
const searchCourses = tool(
  // The function that actually runs (OUR code, never the LLM).
  async ({ query }) => {
    const keys = Object.keys(data['SCOPE']).flatMap(domain => Object.keys(data['SCOPE'][domain]));
    const matches = keys.filter(k => k.toLowerCase().includes(query.toLowerCase()));
    return matches.slice(0, 5).join('\n') || 'No matches';
  },
  {
    name: 'searchCourses',
    // The description is basically a prompt: it tells the LLM WHEN to use this tool.
    description: 'Search SCOPE courses by code or name. Returns up to 5 matching course keys.',
    // The schema says WHAT input the tool takes. Zod checks it before our function runs.
    schema: z.object({
      query: z.string().describe('Part of a course code or name, e.g. "BCSE302" or "database"'),
    }),
  }
);

async function main() {
  // 2) What the LLM is shown: just name + description + JSON schema. Never our code.
  console.log('=== What the LLM sees ===');
  console.log(JSON.stringify(convertToOpenAITool(searchCourses), null, 2));

  // 3) We can call the tool ourselves, like a normal function.
  console.log('\n=== Direct call ===');
  console.log(await searchCourses.invoke({ query: 'database' }));

  // 4) What happens when an LLM asks for it: it sends a "tool call" (name + args + an id).
  //    Running it gives back a ToolMessage carrying the same id, so the LLM can match
  //    the answer to its request.
  console.log('\n=== As a tool call (what an LLM would send) ===');
  const reply = await searchCourses.invoke({
    type: 'tool_call',
    id: 'call_1',
    name: 'searchCourses',
    args: { query: 'OS' },
  });
  console.log(reply.constructor.name, '| id:', reply.tool_call_id);
  console.log(reply.content);
}

main();
