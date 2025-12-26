import { type NextRequest, NextResponse } from "next/server";
import Together from "together-ai";
import { auth } from "@clerk/nextjs/server";
import {
  updatePage,
  createStory,
  createPage,
  getNextPageNumber,
  getStoryById,
  getLastPageImage,
  getStoryCharacterImages,
} from "@/lib/db-actions";
import { freeTierRateLimit } from "@/lib/rate-limit";
import { COMIC_STYLES } from "@/lib/constants";
import { uploadImageToS3 } from "@/lib/s3-upload";
import { buildComicPrompt } from "@/lib/prompt";

const NEW_MODEL = false;

const IMAGE_MODEL = NEW_MODEL
  ? "google/gemini-3-pro-image"
  : "google/flash-image-2.5";

const FIXED_DIMENSIONS = NEW_MODEL
  ? { width: 896, height: 1200 }
  : { width: 864, height: 1184 };

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const {
      storyId,
      prompt,
      apiKey,
      style = "noir",
      characterImages = [],
      isContinuation = false,
      previousContext = "",
    } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Determine which API key to use
    let finalApiKey = apiKey;
    const isUsingFreeTier = !apiKey;

    if (isUsingFreeTier) {
      // Using free tier - apply rate limiting
      const { success, reset } = await freeTierRateLimit.limit(userId);

      if (!success) {
        const resetDate = new Date(reset);
        const timeUntilReset = Math.ceil(
          (reset - Date.now()) / (1000 * 60 * 60 * 24)
        ); // days

        return NextResponse.json(
          {
            error: `Free tier limit reached. You can generate 1 comic per week. Try again in ${timeUntilReset} day(s), or provide your own API key for unlimited access.`,
            resetDate: resetDate.toISOString(),
            isRateLimited: true,
          },
          { status: 429 }
        );
      }

      // Use default API key for free tier
      finalApiKey = process.env.TOGETHER_API_KEY_DEFAULT;
      if (!finalApiKey) {
        return NextResponse.json(
          {
            error: "Server configuration error - default API key not available",
          },
          { status: 500 }
        );
      }
    }

    let page;
    let story;
    let referenceImages: string[] = [];

    if (storyId) {
      // Continuation: get previous page image and story character images
      story = await getStoryById(storyId);
      if (!story) {
        return NextResponse.json({ error: "Story not found" }, { status: 404 });
      }

      const nextPageNumber = await getNextPageNumber(storyId);
      page = await createPage({
        storyId,
        pageNumber: nextPageNumber,
        prompt,
        characterImageUrls: characterImages,
      });

      // Get previous page image for style consistency (unless it's page 1)
      if (nextPageNumber > 1) {
        const lastPageImage = await getLastPageImage(storyId);
        if (lastPageImage) {
          referenceImages.push(lastPageImage);
        }
      }

      // Get story character images (up to 2 most recent)
      const storyCharacterImages = await getStoryCharacterImages(storyId);
      referenceImages.push(...storyCharacterImages.slice(-2)); // Take last 2
    } else {
      // New story: no previous page reference
      story = await createStory({
        title: prompt.length > 50 ? prompt.substring(0, 50) + "..." : prompt,
        description: undefined,
        userId: userId,
        style,
      });

      page = await createPage({
        storyId: story.id,
        pageNumber: 1,
        prompt,
        characterImageUrls: characterImages,
      });
    }

    // Add current character images to references
    referenceImages.push(...characterImages);

    const dimensions = FIXED_DIMENSIONS;

    const fullPrompt = buildComicPrompt({
      prompt,
      style,
      characterImages,
      isContinuation,
      previousContext,
    });

    const client = new Together({ apiKey: finalApiKey });

    let response;
    try {
      response = await client.images.generate({
        model: IMAGE_MODEL,
        prompt: fullPrompt,
        width: dimensions.width,
        height: dimensions.height,
        temperature: 0.1, // Lower temperature for more consistent face matching
        reference_images: referenceImages.length > 0 ? referenceImages : undefined,
      });
    } catch (error) {
      console.error("Together AI API error:", error);

      if (error instanceof Error && "status" in error) {
        const status = (error as any).status;
        if (status === 402) {
          return NextResponse.json(
            {
              error:
                "Insufficient API credits. Please add credits to your Together.ai account at https://api.together.ai/settings/billing or update your API key.",
              errorType: "credit_limit",
            },
            { status: 402 }
          );
        }
        return NextResponse.json(
          {
            error: error.message || `Failed to generate image: ${status}`,
            errorType: "api_error",
          },
          { status: status || 500 }
        );
      }

      return NextResponse.json(
        {
          error: `Internal server error: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        },
        { status: 500 }
      );
    }

    if (!response.data || !response.data[0] || !response.data[0].url) {
      return NextResponse.json(
        { error: "No image URL in response" },
        { status: 500 }
      );
    }

    const imageUrl = response.data[0].url;

    // Upload image to S3 for permanent storage
    const s3Key = `${storyId || story!.id}/page-${page.pageNumber}-${Date.now()}.jpg`;
    const s3ImageUrl = await uploadImageToS3(imageUrl, s3Key);

    // Update page in database with S3 URL
    try {
      await updatePage(page.id, s3ImageUrl);
    } catch (dbError) {
      console.error("Error updating page in database:", dbError);
      return NextResponse.json(
        { error: "Failed to save generated image" },
        { status: 500 }
      );
    }

    const responseData = storyId
      ? { imageUrl: s3ImageUrl, pageId: page.id, pageNumber: page.pageNumber }
      : {
          imageUrl: s3ImageUrl,
          storyId: story!.id,
          storySlug: story!.slug,
          pageId: page.id,
          pageNumber: page.pageNumber,
        };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Error in generate-comic API:", error);
    return NextResponse.json(
      {
        error: `Internal server error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      },
      { status: 500 }
    );
  }
}
