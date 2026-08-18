# Craftwell FAQ

## 1. What is Craftwell and what does it do?

Craftwell is an AI-powered health companion that helps you discover, track, and follow science-based health protocols. It draws on neuroscience research and peer-reviewed studies to recommend practical tools for improving sleep, focus, exercise, stress management, and more. You can browse protocols, activate the ones you want to follow, track daily completions, build streaks, and chat with an AI adviser for personalized guidance.

## 2. Is Craftwell free?

Yes. Craftwell is currently free to use. You can create an account, browse all protocols, track your progress, and use the AI chat adviser at no cost.

## 3. How are protocols ranked?

Protocols are ranked by an **effectiveness rank** that reflects the strength and breadth of scientific evidence supporting them. Protocols with more robust research backing and broader real-world applicability appear higher. Within each protocol, individual tools (steps) are also ranked from most effective to least effective, so you know where to focus your effort first.

## 4. What sources do you use?

Craftwell's knowledge base is built from neuroscience research, peer-reviewed studies, and expert-reviewed health content. The AI adviser uses a retrieval-augmented generation (RAG) system that searches a curated vector database of research content to ground its answers in evidence rather than general training data.

## 5. Is this medical advice?

No. Craftwell provides health information for educational purposes only. It is not a substitute for professional medical advice, diagnosis, or treatment. The AI adviser includes safety disclaimers when discussing supplements, exercise programs, or anything with medical implications. Always consult a qualified healthcare provider before making changes to your health routine, starting new supplements, or modifying medications.

## 6. How does the AI chat work?

The AI chat uses Claude (by Anthropic) combined with a knowledge retrieval system. When you ask a question, the system searches a vector database of research content to find relevant context, then feeds that context to the AI model so its answer is grounded in the knowledge base. The AI maintains conversation history within a session (up to 20 turns), so it can follow up on previous questions. You can also start a chat from a specific protocol page to get advice targeted to that protocol.

## 7. Can I track multiple protocols at the same time?

Yes. You can activate as many protocols as you want. Each activated protocol has its own daily checklist and independent streak tracking. The dashboard shows all your active protocols side by side so you can see your weekly progress across everything you are working on.

## 8. How do streaks work?

A streak counts consecutive days where you fully complete all tools in a protocol. "Fully complete" means every tool in the protocol is checked off for that day. Your current streak counts backward from today (or yesterday, if you have not yet completed today). The app also tracks your longest-ever streak for each protocol.

## 9. What happens if I miss a day?

Your current streak resets to zero. However, your longest streak record is preserved, your total completed days count is unaffected, and your full completion history remains intact. Missing a day has no other penalty. You can resume tracking the next day and start building a new streak.

## 10. What health categories are covered?

Craftwell covers a range of categories including but not limited to: sleep optimization, focus and productivity, exercise and fitness, stress management, supplementation, cold and heat exposure, breathing techniques, nutrition, and hormonal health. New categories and protocols may be added as the knowledge base grows.

## 11. How do I delete my account?

Go to the **Profile** page and use the delete account option. This permanently removes your authentication credentials, all protocol completions, chat history, survey responses, and user profile data. This action cannot be undone. If you just want to take a break, consider deactivating your protocols instead.

## 12. Is my data safe?

Craftwell uses Supabase (built on PostgreSQL) with Row-Level Security (RLS) policies, which means your data is isolated at the database level -- no user can read or modify another user's data. Authentication is handled by Supabase Auth with support for email, phone, and Google OAuth. The app is served over HTTPS and deployed on Vercel's infrastructure.

## 13. Can I use Craftwell on mobile?

Yes. Craftwell is a Progressive Web App (PWA), which means it works in any modern mobile browser and can be installed to your home screen for a native app-like experience. There is also offline support for basic functionality. Simply visit the site on your phone and use your browser's "Add to Home Screen" option.

## 14. How is Craftwell different from Headspace, Oura, or Whoop?

Craftwell focuses specifically on science-based health protocols backed by neuroscience research, rather than guided meditation (Headspace), biometric tracking (Oura), or fitness recovery metrics (Whoop). Craftwell does not require any wearable hardware. Instead, it helps you discover actionable protocols and build consistent habits through daily checklists, streaks, and AI-powered guidance. Think of it as a protocol playbook with a built-in AI coach.

## 15. Can I suggest new protocols?

Not directly through the app at this time. Protocols are curated from research sources via an automated ingestion pipeline and reviewed for quality. If you have suggestions, reach out to the team through the contact channels listed below and your input will be considered for future updates.

## 16. What is cold exposure / NSDR / other specific protocols?

- **Cold exposure** refers to deliberate exposure to cold temperatures (cold showers, ice baths, cold plunges) to improve mood, alertness, and resilience. Protocols include specific temperature ranges, durations, and timing.
- **NSDR (Non-Sleep Deep Rest)** is a set of practices -- including yoga nidra and specific guided relaxation techniques -- designed to promote deep mental and physical rest without actual sleep. It can help with focus, recovery, and stress reduction.
- You can learn about any protocol by visiting its detail page or asking the AI chat adviser for a full explanation.

## 17. Do I need special equipment?

Most protocols require no special equipment. Many involve behavioral changes like adjusting your light exposure, breathing patterns, or sleep schedule. Some protocols may reference optional tools (a cold plunge, specific supplements, or exercise equipment), but alternatives and modifications are typically available. Each protocol's detail page lists what is needed.

## 18. Can I share protocols with others?

Yes. Each protocol has a **share button** that lets you share its page via your device's native sharing capabilities (link copying, messaging apps, social media, etc.). The shared link takes recipients to the protocol's public detail page.

## 19. How often is content updated?

The evidence registry refreshes weekly from official episode metadata and
PubMed citation indexes. It stores canonical links and provenance rather than
copying full transcripts, articles, books, or licensed databases. New guest
author matches and medical claims require review before they affect protocols.

## 20. How do I contact support?

For questions, bug reports, or feedback, you can reach the Craftwell team through the project's GitHub repository at [github.com/Vladislav-Voloshin/craftwell-health-adviser](https://github.com/Vladislav-Voloshin/craftwell-health-adviser). Open an issue for bug reports or feature requests, or use the repository's discussions section for general questions.
