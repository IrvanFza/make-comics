import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { freeTierRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { stories } from "@/lib/schema";
import { gte } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { hasApiKey } = await request.json();

    // Check if user has API key (unlimited)
    if (hasApiKey) {
      return NextResponse.json({
        hasApiKey: true,
        creditsRemaining: "unlimited",
        resetTime: null,
      });
    }

    // For free tier, check rate limit status
    try {
      // Try to check remaining without consuming
      const limitResult = await freeTierRateLimit.getRemaining(userId);

      return NextResponse.json({
        hasApiKey: false,
        creditsRemaining: limitResult.remaining,
        resetTime: limitResult.reset,
      });
    } catch (error) {
      console.error("Rate limit check error:", error);
      // Fallback to database check
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const recentStories = await db
        .select()
        .from(stories)
        .where(gte(stories.createdAt, sevenDaysAgo))
        .limit(1);

      const hasUsedCredit = recentStories.length > 0;

      return NextResponse.json({
        hasApiKey: false,
        creditsRemaining: hasUsedCredit ? 0 : 1,
        resetTime: hasUsedCredit ? sevenDaysAgo.getTime() + 7 * 24 * 60 * 60 * 1000 : null,
      });
    }
  } catch (error) {
    console.error("Error in check-credits API:", error);
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