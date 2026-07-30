import type Together from "together-ai";

const TEXT_MODEL = "Qwen/Qwen3.5-9B";

type CompletionRequest =
  Together.Chat.Completions.CompletionCreateParamsNonStreaming;
type CompletionResponse = Together.Chat.Completions.ChatCompletion;

export type CreateCompletion = (
  request: CompletionRequest,
) => Promise<CompletionResponse>;

export type StoryMetadata = {
  title: string;
  description?: string;
};

type GenerateStoryMetadataOptions = {
  createCompletion: CreateCompletion;
  prompt: string;
  styleName: string;
};

export async function generateStoryMetadata({
  createCompletion,
  prompt,
  styleName,
}: GenerateStoryMetadataOptions): Promise<StoryMetadata> {
  const titlePrompt = `Based on this comic book prompt, generate a compelling title and description for the comic book.

Prompt: "${prompt}"
Style: ${styleName}

Generate:
1. A catchy, engaging title (maximum 60 characters)
2. A brief description (2-3 sentences, maximum 200 characters)

Format your response as JSON:
{
  "title": "Title here",
  "description": "Description here"
}

Only return the JSON, no other text.`;

  const textResponse = await createCompletion({
    model: TEXT_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a creative assistant that generates compelling comic book titles and descriptions. Always respond with valid JSON only.",
      },
      {
        role: "user",
        content: titlePrompt,
      },
    ],
    temperature: 0.8,
    max_tokens: 300,
    reasoning: { enabled: false },
  });

  const content = textResponse.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("No response from text generation");
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in response");
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const rawTitle =
    parsed.title?.trim() ||
    (prompt.length > 50 ? prompt.substring(0, 50) + "..." : prompt);
  const rawDescription = parsed.description?.trim();

  const title =
    rawTitle.length > 60 ? rawTitle.substring(0, 57) + "..." : rawTitle;
  const description =
    rawDescription && rawDescription.length > 200
      ? rawDescription.substring(0, 197) + "..."
      : rawDescription;

  return {
    title,
    description: description || undefined,
  };
}
