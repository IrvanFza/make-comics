const assert = require("node:assert/strict");
const test = require("node:test");
import type Together from "together-ai";
import type { CreateCompletion } from "./story-metadata";

const { generateStoryMetadata } = require("./story-metadata.ts");

test("generates story metadata without exhausting output on reasoning", async () => {
  const createCompletion: CreateCompletion = async (request) => {
    const content =
      request.reasoning?.enabled === false
        ? JSON.stringify({
            title: "The Clockwork Moon",
            description: "A mechanic races to repair the moon before dawn.",
          })
        : null;

    return {
      choices: [{ message: { role: "assistant", content } }],
    } as Together.Chat.Completions.ChatCompletion;
  };

  const metadata = await generateStoryMetadata({
    createCompletion,
    prompt: "A young mechanic discovers that the moon is a machine.",
    styleName: "Noir",
  });

  assert.deepEqual(metadata, {
    title: "The Clockwork Moon",
    description: "A mechanic races to repair the moon before dawn.",
  });
});
