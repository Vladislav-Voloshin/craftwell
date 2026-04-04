/**
 * PubMed Research Scraper
 *
 * Fetches top-cited health and neuroscience research articles from PubMed.
 * Uses the NCBI E-utilities API (free, no key required for <3 req/sec).
 * Stores abstracts in Supabase for chunking and embedding.
 */

import { getSupabaseAdmin as getSupabase, cleanHtml } from "./shared";
import logger from "@/lib/logger";

interface PubMedArticle {
  pmid: string;
  title: string;
  abstract: string;
  authors: string[];
  journal: string;
  publish_date: string;
  keywords: string[];
  doi: string;
}

const HEALTH_TOPICS = [
  "sleep optimization circadian rhythm",
  "cold exposure thermogenesis health",
  "heat exposure sauna cardiovascular",
  "dopamine motivation reward system",
  "exercise neuroscience brain health",
  "intermittent fasting metabolism",
  "meditation mindfulness stress reduction",
  "caffeine cognitive performance",
  "magnesium sleep supplementation",
  "omega-3 fatty acids brain health",
  "vitamin D immune function",
  "creatine cognitive performance",
  "ashwagandha cortisol stress",
  "rhodiola rosea fatigue",
  "testosterone optimization exercise",
  "estrogen health menopause",
  "gut microbiome mental health",
  "neuroplasticity learning memory",
  "breathwork respiratory sinus arrhythmia",
  "light therapy circadian mood",
  "zinc immune supplementation",
  "L-theanine focus anxiety",
  "resveratrol longevity aging",
  "NAD+ NMN cellular aging",
  "cortisol stress management",
];

/**
 * Search PubMed for articles on a topic, sorted by relevance
 */
async function searchPubMed(
  query: string,
  maxResults = 10
): Promise<string[]> {
  const baseUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
  const searchUrl = `${baseUrl}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(
    query
  )}&retmax=${maxResults}&sort=relevance&retmode=json`;

  const response = await fetch(searchUrl);
  if (!response.ok) throw new Error(`PubMed search error: ${response.status}`);

  const data = await response.json();
  return data.esearchresult?.idlist || [];
}

/**
 * Fetch article details from PubMed by PMID
 */
async function fetchArticleDetails(
  pmids: string[]
): Promise<PubMedArticle[]> {
  if (pmids.length === 0) return [];

  const baseUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
  const fetchUrl = `${baseUrl}/efetch.fcgi?db=pubmed&id=${pmids.join(
    ","
  )}&retmode=xml`;

  const response = await fetch(fetchUrl);
  if (!response.ok) throw new Error(`PubMed fetch error: ${response.status}`);

  const xml = await response.text();
  return parseArticlesXml(xml);
}

/**
 * Parse PubMed XML response into structured articles
 */
function parseArticlesXml(xml: string): PubMedArticle[] {
  const articles: PubMedArticle[] = [];
  const articleRegex =
    /<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g;
  let match;

  while ((match = articleRegex.exec(xml)) !== null) {
    const articleXml = match[1];

    const pmid = extractTag(articleXml, "PMID") || "";
    const title = extractTag(articleXml, "ArticleTitle") || "";
    const abstractText = extractAbstract(articleXml);
    const journal =
      extractTag(articleXml, "Title") || extractTag(articleXml, "ISOAbbreviation") || "";

    // Extract authors
    const authors: string[] = [];
    const authorRegex =
      /<Author[\s\S]*?<LastName>(.*?)<\/LastName>[\s\S]*?<ForeName>(.*?)<\/ForeName>/g;
    let authorMatch;
    while ((authorMatch = authorRegex.exec(articleXml)) !== null) {
      authors.push(`${authorMatch[2]} ${authorMatch[1]}`);
    }

    // Extract date
    const year = extractTag(articleXml, "Year") || "";
    const month = extractTag(articleXml, "Month") || "01";
    const day = extractTag(articleXml, "Day") || "01";
    const publishDate = year ? `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` : "";

    // Extract keywords
    const keywords: string[] = [];
    const kwRegex = /<Keyword[^>]*>(.*?)<\/Keyword>/g;
    let kwMatch;
    while ((kwMatch = kwRegex.exec(articleXml)) !== null) {
      keywords.push(kwMatch[1]);
    }

    // Extract DOI
    const doiMatch = articleXml.match(
      /<ArticleId IdType="doi">(.*?)<\/ArticleId>/
    );
    const doi = doiMatch ? doiMatch[1] : "";

    if (title && abstractText) {
      articles.push({
        pmid,
        title: cleanHtml(title),
        abstract: cleanHtml(abstractText),
        authors: authors.slice(0, 5),
        journal,
        publish_date: publishDate,
        keywords,
        doi,
      });
    }
  }

  return articles;
}

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, "s");
  const match = xml.match(regex);
  return match ? match[1].trim() : "";
}

function extractAbstract(xml: string): string {
  // Handle structured abstracts with multiple sections
  const abstractMatch = xml.match(
    /<Abstract>([\s\S]*?)<\/Abstract>/
  );
  if (!abstractMatch) return "";

  const abstractXml = abstractMatch[1];
  const sections: string[] = [];
  const sectionRegex =
    /<AbstractText[^>]*(?:Label="([^"]*)")?[^>]*>([\s\S]*?)<\/AbstractText>/g;
  let sMatch;

  while ((sMatch = sectionRegex.exec(abstractXml)) !== null) {
    const label = sMatch[1];
    const text = sMatch[2].trim();
    if (label) {
      sections.push(`${label}: ${text}`);
    } else {
      sections.push(text);
    }
  }

  return sections.length > 0
    ? sections.join("\n\n")
    : abstractXml.replace(/<[^>]*>/g, "").trim();
}


/**
 * Store articles in the content_chunks table (ready for embedding)
 */
async function storeArticles(articles: PubMedArticle[]): Promise<number> {
  const supabase = getSupabase();
  let stored = 0;

  for (const article of articles) {
    const content = [
      `Title: ${article.title}`,
      `Authors: ${article.authors.join(", ")}`,
      `Journal: ${article.journal}`,
      `Published: ${article.publish_date}`,
      `Keywords: ${article.keywords.join(", ")}`,
      "",
      article.abstract,
    ].join("\n");

    const { error } = await supabase.from("content_chunks").insert({
      source_type: "research",
      source_title: article.title,
      source_id: `pubmed-${article.pmid}`,
      content,
      metadata: {
        pmid: article.pmid,
        doi: article.doi,
        journal: article.journal,
        authors: article.authors.join(", "),
        publish_date: article.publish_date,
      },
    });

    if (error) {
      if (error.code === "23505") continue; // duplicate, skip
      logger.error({ err: error, pmid: article.pmid }, "Error storing article");
    } else {
      stored++;
    }
  }

  return stored;
}

/**
 * Main PubMed scraping pipeline
 */
export async function runPubMedScraper() {
  logger.info("Starting PubMed research scraper");
  let totalArticles = 0;

  for (const topic of HEALTH_TOPICS) {
    logger.info({ topic }, "Searching PubMed");

    try {
      const pmids = await searchPubMed(topic, 10);
      if (pmids.length === 0) {
        logger.info({ topic }, "No PubMed results");
        continue;
      }

      // Rate limit: max 3 requests per second to NCBI
      await new Promise((r) => setTimeout(r, 400));

      const articles = await fetchArticleDetails(pmids);
      const stored = await storeArticles(articles);
      totalArticles += stored;

      logger.info({ found: articles.length, stored }, "Stored PubMed articles");

      // Rate limit between topics
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      logger.error({ err, topic }, "Error processing PubMed topic");
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  logger.info({ totalArticles }, "PubMed scraper complete");
  return totalArticles;
}
