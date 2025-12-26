import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getStoryWithPagesBySlug } from "@/lib/db-actions";
import { db } from "@/lib/db";
import { stories } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> }
) {
  try {
    const authResult = await auth();
    const { userId } = authResult;

    console.log('API: auth result:', authResult);
    console.log('API: userId type:', typeof userId, 'value:', userId);
    console.log('API: timestamp:', new Date().toISOString());

    const { storySlug: slug } = await params;

    // Special case: if slug is "all", return user's stories for debugging
    if (slug === "all") {
      if (!userId) {
        return NextResponse.json(
          { error: "Authentication required for this endpoint" },
          { status: 401 }
        );
      }
      const userStories = await db.select().from(stories).where(eq(stories.userId, userId));
      return NextResponse.json({
        message: "User stories",
        stories: userStories.map(s => ({ id: s.id, slug: s.slug, title: s.title }))
      });
    }

    if (!slug) {
      return NextResponse.json(
        { error: "Story slug is required" },
        { status: 400 }
      );
    }

    const result = await getStoryWithPagesBySlug(slug);

    if (!result) {
      return NextResponse.json(
        { error: "Story not found" },
        { status: 404 }
      );
    }

    // Check if the story belongs to the authenticated user
    const isOwner = userId ? result.story.userId === userId : false;

    // Return the story data with ownership information
    const responseData = {
      ...result,
      isOwner,
    };
    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Error fetching story:", error);
    return NextResponse.json(
      { error: "Failed to fetch story" },
      { status: 500 }
    );
  }
}