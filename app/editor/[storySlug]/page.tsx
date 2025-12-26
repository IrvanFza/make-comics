import { Metadata } from "next";
import { getStoryWithPagesBySlug } from "@/lib/db-actions";
import { StoryEditorClient } from "./story-editor-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ storySlug: string }>;
}): Promise<Metadata> {
  const { storySlug: slug } = await params;

  try {
    const result = await getStoryWithPagesBySlug(slug);

    if (!result) {
      return {
        title: "Story Not Found | MakeComics",
        description: "The requested comic story could not be found.",
      };
    }

    const { story } = result;
    const title = `${story.title} | MakeComics`;
    const description =
      story.description ||
      `${story.title} - Create your own comic book with MakeComics`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
      },
    };
  } catch (error) {
    console.error("Error generating metadata:", error);
    return {
      title: "MakeComics",
      description: "Create your own comic book with MakeComics",
    };
  }
}

export default function StoryEditorPage() {
  return <StoryEditorClient />;
}
