/**
 * Guest Expert Research Scraper
 *
 * Extracts guest experts from podcast episodes and fetches their
 * key research papers from PubMed. This expands the knowledge base
 * with research from experts who appeared on the podcast.
 */

import { getSupabaseAdmin as getSupabase, cleanHtml } from "./shared";
import logger from "@/lib/logger";

interface GuestResearch {
  guest_name: string;
  pmid: string;
  title: string;
  abstract: string;
  journal: string;
  publish_date: string;
}

/**
 * Get all unique guests from podcast episodes
 */
async function getGuests(): Promise<
  { name: string; episode_title: string }[]
> {
  const supabase = getSupabase();
  const { data: episodes } = await supabase
    .from("podcast_episodes")
    .select("title, guests")
    .not("guests", "eq", "{}");

  if (!episodes) return [];

  const guests: { name: string; episode_title: string }[] = [];
  const seen = new Set<string>();

  for (const ep of episodes) {
    for (const guest of ep.guests || []) {
      const normalized = guest.trim();
      if (normalized && !seen.has(normalized.toLowerCase())) {
        seen.add(normalized.toLowerCase());
        guests.push({ name: normalized, episode_title: ep.title });
      }
    }
  }

  return guests;
}

/**
 * Search PubMed for a guest's research
 */
async function searchGuestResearch(
  guestName: string,
  maxResults = 5
): Promise<string[]> {
  const baseUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
  // Search by author name + relevant health topics
  const query = `${guestName}[Author] AND (neuroscience OR health OR exercise OR sleep OR nutrition)`;
  const searchUrl = `${baseUrl}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(
    query
  )}&retmax=${maxResults}&sort=relevance&retmode=json`;

  const response = await fetch(searchUrl);
  if (!response.ok) return [];

  const data = await response.json();
  return data.esearchresult?.idlist || [];
}

/**
 * Fetch article details from PubMed
 */
async function fetchArticles(pmids: string[]): Promise<GuestResearch[]> {
  if (pmids.length === 0) return [];

  const baseUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
  const fetchUrl = `${baseUrl}/efetch.fcgi?db=pubmed&id=${pmids.join(
    ","
  )}&retmode=xml`;

  const response = await fetch(fetchUrl);
  if (!response.ok) return [];

  const xml = await response.text();
  const articles: GuestResearch[] = [];

  const articleRegex =
    /<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g;
  let match;

  while ((match = articleRegex.exec(xml)) !== null) {
    const articleXml = match[1];
    const pmidMatch = articleXml.match(/<PMID[^>]*>(.*?)<\/PMID>/);
    const titleMatch = articleXml.match(
      /<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/
    );
    const abstractMatch = articleXml.match(
      /<Abstract>([\s\S]*?)<\/Abstract>/
    );
    const journalMatch = articleXml.match(/<Title>(.*?)<\/Title>/);
    const yearMatch = articleXml.match(
      /<PubDate>[\s\S]*?<Year>(.*?)<\/Year>/
    );

    if (titleMatch && abstractMatch) {
      articles.push({
        guest_name: "",
        pmid: pmidMatch ? pmidMatch[1] : "",
        title: cleanHtml(titleMatch[1]),
        abstract: cleanHtml(abstractMatch[1]),
        journal: journalMatch ? cleanHtml(journalMatch[1]) : "",
        publish_date: yearMatch ? yearMatch[1] : "",
      });
    }
  }

  return articles;
}


/**
 * Store guest research as content chunks
 */
async function storeGuestResearch(
  guestName: string,
  articles: GuestResearch[]
): Promise<number> {
  const supabase = getSupabase();
  let stored = 0;

  for (const article of articles) {
    const content = [
      `Research by podcast guest: ${guestName}`,
      `Title: ${article.title}`,
      `Journal: ${article.journal}`,
      `Published: ${article.publish_date}`,
      "",
      article.abstract,
    ].join("\n");

    const { error } = await supabase.from("content_chunks").insert({
      source_type: "research",
      source_title: `${article.title} (${guestName})`,
      source_id: `guest-${article.pmid}`,
      content,
      metadata: {
        guest_name: guestName,
        pmid: article.pmid,
        journal: article.journal,
      },
    });

    if (error) {
      if (error.code === "23505") continue;
      logger.error({ err: error, guestName }, "Error storing guest research");
    } else {
      stored++;
    }
  }

  return stored;
}

/**
 * Main guest research scraping pipeline
 */
export async function runGuestResearchScraper() {
  logger.info("Starting guest expert research scraper");

  const guests = await getGuests();
  logger.info({ count: guests.length }, "Found unique guests from episodes");

  let totalStored = 0;

  for (const guest of guests) {
    logger.info({ name: guest.name }, "Searching research for guest");

    try {
      const pmids = await searchGuestResearch(guest.name, 5);

      if (pmids.length === 0) {
        logger.info({ name: guest.name }, "No PubMed results for guest");
        continue;
      }

      await new Promise((r) => setTimeout(r, 400));

      const articles = await fetchArticles(pmids);
      const stored = await storeGuestResearch(guest.name, articles);
      totalStored += stored;

      logger.info({ found: articles.length, stored, name: guest.name }, "Stored guest research");

      // Rate limit
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      logger.error({ err, name: guest.name }, "Error processing guest research");
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  logger.info({ totalStored }, "Guest research scraper complete");
  return totalStored;
}
