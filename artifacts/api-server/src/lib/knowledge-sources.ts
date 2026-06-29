export interface KnowledgeSource {
  name: string;
  url: string;
}

export interface KnowledgeCategory {
  id: string;
  name: string;
  sources: KnowledgeSource[];
}

export const KNOWLEDGE_SOURCES: KnowledgeCategory[] = [
  {
    id: "cs-foundations",
    name: "CS Foundations",
    sources: [
      { name: "Teach Yourself CS", url: "https://teachyourselfcs.com/" },
      { name: "MIT OpenCourseWare", url: "https://ocw.mit.edu/" },
      { name: "CS50 Harvard", url: "https://cs50.harvard.edu/" },
      { name: "Stanford Engineering", url: "https://see.stanford.edu/" },
    ],
  },
  {
    id: "binary-digital-logic",
    name: "Binary / Digital Logic",
    sources: [
      { name: "Nand2Tetris", url: "https://www.nand2tetris.org/" },
      { name: "Nand2Tetris Book", url: "https://www.nand2tetris.org/book" },
      { name: "Nand2Tetris Coursera", url: "https://www.coursera.org/learn/build-a-computer" },
    ],
  },
  {
    id: "computer-architecture",
    name: "Computer Architecture",
    sources: [
      { name: "CS:APP (CMU)", url: "https://csapp.cs.cmu.edu/" },
      { name: "RISC-V", url: "https://riscv.org/" },
      { name: "Intel SDM", url: "https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html" },
      { name: "AMD Developer", url: "https://www.amd.com/en/developer" },
      { name: "ARM Documentation", url: "https://developer.arm.com/documentation" },
    ],
  },
  {
    id: "operating-systems",
    name: "Operating Systems",
    sources: [
      { name: "OSTEP", url: "https://pages.cs.wisc.edu/~remzi/OSTEP/" },
      { name: "Linux Kernel Docs", url: "https://docs.kernel.org/" },
      { name: "Linux From Scratch", url: "https://www.linuxfromscratch.org/" },
    ],
  },
  {
    id: "networking",
    name: "Networking",
    sources: [
      { name: "Beej's Guide", url: "https://beej.us/guide/" },
      { name: "RFC Database", url: "https://www.rfc-editor.org/" },
      { name: "IETF", url: "https://www.ietf.org/" },
      { name: "Wireshark Docs", url: "https://www.wireshark.org/docs/" },
    ],
  },
  {
    id: "algorithms",
    name: "Algorithms & Data Structures",
    sources: [
      { name: "CP Algorithms", url: "https://cp-algorithms.com/" },
      { name: "Open Data Structures", url: "https://opendatastructures.org/" },
      { name: "Algorithm Visualizer", url: "https://algorithm-visualizer.org/" },
    ],
  },
  {
    id: "mathematics",
    name: "Mathematics",
    sources: [
      { name: "OpenStax", url: "https://openstax.org/" },
      { name: "Paul's Online Math Notes", url: "https://tutorial.math.lamar.edu/" },
      { name: "3Blue1Brown", url: "https://www.3blue1brown.com/" },
    ],
  },
  {
    id: "git-github",
    name: "Git & GitHub",
    sources: [
      { name: "Git Documentation", url: "https://git-scm.com/docs" },
      { name: "Pro Git (Free Book)", url: "https://git-scm.com/book/en/v2" },
      { name: "GitHub Docs", url: "https://docs.github.com/" },
      { name: "GitHub REST API", url: "https://docs.github.com/en/rest" },
      { name: "GitHub GraphQL", url: "https://docs.github.com/en/graphql" },
    ],
  },
  {
    id: "devops",
    name: "DevOps & Infrastructure",
    sources: [
      { name: "Docker Docs", url: "https://docs.docker.com/" },
      { name: "Kubernetes Docs", url: "https://kubernetes.io/docs/" },
      { name: "Terraform Docs", url: "https://developer.hashicorp.com/terraform/docs" },
      { name: "Ansible Docs", url: "https://docs.ansible.com/" },
    ],
  },
  {
    id: "shell-scripting",
    name: "Shell & Scripting",
    sources: [
      { name: "Bash Manual (GNU)", url: "https://www.gnu.org/software/bash/manual/" },
      { name: "PowerShell Docs", url: "https://learn.microsoft.com/powershell/" },
    ],
  },
  {
    id: "python",
    name: "Python",
    sources: [
      { name: "Python Official Docs", url: "https://docs.python.org/3/" },
      { name: "Python PEPs", url: "https://peps.python.org/" },
      { name: "PyPI", url: "https://pypi.org/" },
    ],
  },
  {
    id: "javascript",
    name: "JavaScript",
    sources: [
      { name: "MDN Web Docs", url: "https://developer.mozilla.org/" },
      { name: "ECMAScript Spec", url: "https://tc39.es/ecma262/" },
      { name: "Node.js Docs", url: "https://nodejs.org/docs/latest/api/" },
    ],
  },
  {
    id: "typescript",
    name: "TypeScript",
    sources: [
      { name: "TypeScript Docs", url: "https://www.typescriptlang.org/docs/" },
    ],
  },
  {
    id: "web-frontend",
    name: "Web / Frontend Standards",
    sources: [
      { name: "HTML Living Standard", url: "https://html.spec.whatwg.org/" },
      { name: "MDN CSS", url: "https://developer.mozilla.org/docs/Web/CSS" },
      { name: "CSS Spec (W3C)", url: "https://www.w3.org/Style/CSS/" },
      { name: "MDN Web APIs", url: "https://developer.mozilla.org/docs/Web/API" },
    ],
  },
  {
    id: "frameworks",
    name: "Frontend Frameworks",
    sources: [
      { name: "React", url: "https://react.dev/" },
      { name: "Next.js", url: "https://nextjs.org/docs" },
      { name: "Vue", url: "https://vuejs.org/" },
      { name: "Angular", url: "https://angular.dev/" },
      { name: "Svelte", url: "https://svelte.dev/docs" },
    ],
  },
  {
    id: "systems-languages",
    name: "Systems Languages",
    sources: [
      { name: "The Rust Book", url: "https://doc.rust-lang.org/book/" },
      { name: "Rust Reference", url: "https://doc.rust-lang.org/reference/" },
      { name: "Go Docs", url: "https://go.dev/doc/" },
      { name: "C Reference (cppreference)", url: "https://en.cppreference.com/w/c" },
      { name: "C++ Reference (cppreference)", url: "https://en.cppreference.com/w/" },
      { name: "Zig Docs", url: "https://ziglang.org/documentation/" },
    ],
  },
  {
    id: "jvm-dotnet",
    name: "JVM & .NET Languages",
    sources: [
      { name: "Java Docs (Oracle)", url: "https://docs.oracle.com/en/java/" },
      { name: "Kotlin Docs", url: "https://kotlinlang.org/docs/" },
      { name: "C# / .NET Docs", url: "https://learn.microsoft.com/dotnet/" },
      { name: "Scala Docs", url: "https://docs.scala-lang.org/" },
    ],
  },
  {
    id: "other-languages",
    name: "Other Languages",
    sources: [
      { name: "Swift Docs", url: "https://docs.swift.org/" },
      { name: "Apple Developer (ObjC)", url: "https://developer.apple.com/" },
      { name: "Ruby Docs", url: "https://www.ruby-lang.org/en/documentation/" },
      { name: "PHP Docs", url: "https://www.php.net/docs.php" },
      { name: "Perl Docs", url: "https://perldoc.perl.org/" },
      { name: "Lua Manual", url: "https://www.lua.org/manual/" },
      { name: "R Manuals (CRAN)", url: "https://cran.r-project.org/manuals.html" },
      { name: "Julia Docs", url: "https://docs.julialang.org/" },
      { name: "Haskell Docs", url: "https://www.haskell.org/documentation/" },
      { name: "Elixir / HexDocs", url: "https://hexdocs.pm/" },
      { name: "Erlang Docs", url: "https://www.erlang.org/docs" },
      { name: "Nim Docs", url: "https://nim-lang.org/documentation.html" },
      { name: "OCaml Docs", url: "https://ocaml.org/docs" },
    ],
  },
  {
    id: "databases",
    name: "Databases",
    sources: [
      { name: "PostgreSQL Docs", url: "https://www.postgresql.org/docs/" },
      { name: "SQLite Docs", url: "https://sqlite.org/docs.html" },
      { name: "MySQL Docs", url: "https://dev.mysql.com/doc/" },
      { name: "MariaDB KB", url: "https://mariadb.com/kb/" },
      { name: "MongoDB Docs", url: "https://www.mongodb.com/docs/" },
      { name: "Redis Docs", url: "https://redis.io/docs/" },
      { name: "Elasticsearch Guide", url: "https://www.elastic.co/guide/" },
      { name: "GraphQL", url: "https://graphql.org/learn/" },
    ],
  },
  {
    id: "web-servers",
    name: "Web Servers",
    sources: [
      { name: "Apache Docs", url: "https://httpd.apache.org/docs/" },
      { name: "Nginx Docs", url: "https://nginx.org/en/docs/" },
    ],
  },
  {
    id: "linux-gnu",
    name: "Linux / GNU",
    sources: [
      { name: "Linux Man Pages", url: "https://man7.org/linux/man-pages/" },
      { name: "GNU Manuals", url: "https://www.gnu.org/manual/" },
    ],
  },
  {
    id: "gpu-graphics",
    name: "GPU & Graphics",
    sources: [
      { name: "CUDA Docs (NVIDIA)", url: "https://docs.nvidia.com/cuda/" },
      { name: "OpenCL Registry", url: "https://registry.khronos.org/OpenCL/" },
      { name: "Vulkan Registry", url: "https://registry.khronos.org/vulkan/" },
      { name: "OpenGL Registry", url: "https://registry.khronos.org/OpenGL/" },
    ],
  },
  {
    id: "ai-ml",
    name: "AI / Machine Learning",
    sources: [
      { name: "PyTorch Docs", url: "https://pytorch.org/docs/" },
      { name: "TensorFlow API Docs", url: "https://www.tensorflow.org/api_docs" },
      { name: "JAX Docs", url: "https://jax.readthedocs.io/" },
      { name: "Hugging Face Docs", url: "https://huggingface.co/docs" },
      { name: "ONNX", url: "https://onnx.ai/" },
      { name: "scikit-learn", url: "https://scikit-learn.org/stable/" },
    ],
  },
  {
    id: "llm-development",
    name: "LLM Development",
    sources: [
      { name: "OpenAI Platform Docs", url: "https://platform.openai.com/docs" },
      { name: "Anthropic Docs", url: "https://docs.anthropic.com/" },
      { name: "Google AI Docs", url: "https://ai.google.dev/" },
      { name: "LangChain Docs", url: "https://python.langchain.com/" },
      { name: "LlamaIndex Docs", url: "https://docs.llamaindex.ai/" },
      { name: "Model Context Protocol (MCP)", url: "https://modelcontextprotocol.io/" },
    ],
  },
  {
    id: "web-crawling",
    name: "Web Crawling & Browser Testing",
    sources: [
      { name: "Scrapy Docs", url: "https://docs.scrapy.org/" },
      { name: "Playwright Docs", url: "https://playwright.dev/" },
      { name: "Puppeteer Docs", url: "https://pptr.dev/" },
      { name: "Selenium Docs", url: "https://www.selenium.dev/documentation/" },
    ],
  },
  {
    id: "api-standards",
    name: "API Standards",
    sources: [
      { name: "OpenAPI Spec", url: "https://spec.openapis.org/" },
      { name: "Swagger Docs", url: "https://swagger.io/docs/" },
      { name: "gRPC Docs", url: "https://grpc.io/docs/" },
      { name: "REST API Guidelines", url: "https://restfulapi.net/" },
    ],
  },
  {
    id: "security",
    name: "Security",
    sources: [
      { name: "OWASP", url: "https://owasp.org/" },
      { name: "OWASP Top 10", url: "https://owasp.org/www-project-top-ten/" },
      { name: "MITRE ATT&CK", url: "https://attack.mitre.org/" },
      { name: "CWE (MITRE)", url: "https://cwe.mitre.org/" },
      { name: "NIST CSRC", url: "https://csrc.nist.gov/" },
    ],
  },
  {
    id: "standards-bodies",
    name: "Standards Bodies",
    sources: [
      { name: "ISO C++", url: "https://isocpp.org/" },
      { name: "W3C", url: "https://www.w3.org/" },
      { name: "WHATWG", url: "https://whatwg.org/" },
      { name: "Unicode", url: "https://unicode.org/" },
      { name: "RFCs", url: "https://www.rfc-editor.org/" },
      { name: "IEEE Standards", url: "https://standards.ieee.org/" },
    ],
  },
  {
    id: "open-books",
    name: "Open Book Collections",
    sources: [
      { name: "Free Computer Books", url: "https://freecomputerbooks.com/" },
      { name: "Open Library", url: "https://openlibrary.org/" },
      { name: "Internet Archive", url: "https://archive.org/" },
      { name: "Project Gutenberg", url: "https://www.gutenberg.org/" },
      { name: "Springer Open Books", url: "https://link.springer.com/open-access/books" },
      { name: "Open Textbook Library", url: "https://open.umn.edu/opentextbooks" },
      { name: "LibreTexts", url: "https://libretexts.org/" },
    ],
  },
];

/**
 * Injected into every agent system prompt so the swarm always resolves
 * technical documentation questions from authoritative primary sources
 * instead of random blogs or low-trust aggregators.
 */
export const DEV_DOCS_POLICY = `

DEVELOPER DOCUMENTATION POLICY (apply whenever code, CS, or technical questions arise):
When you need documentation for any programming language, framework, library, CS topic, database, API standard, security resource, AI/ML framework, or infrastructure tool — ALWAYS start from the authoritative primary documentation. To find the correct source URL, call: GET /api/reference?q=<topic> (e.g. /api/reference?q=react, /api/reference?q=postgresql, /api/reference?q=typescript, /api/reference?q=security).
Reference priority — use this order:
1. Official language/framework documentation (docs.python.org, react.dev, docs.docker.com, etc.)
2. Language specifications (ECMAScript spec, C++ ISO, Python PEPs, RFCs, IETF)
3. Official books (The Rust Book, Pro Git, OSTEP, CS:APP)
4. University course material (MIT OCW, Stanford SEE, Harvard CS50)
5. Standards bodies (W3C, IETF, IEEE, ISO, WHATWG, Unicode)
6. High-quality open-source repositories (Linux kernel, CPython, LLVM, PostgreSQL source)
NEVER cite a random blog post, SEO tutorial, Stack Overflow answer, or AI-generated summary as documentation when official primary sources exist. If the operator asks a technical question and you need a source, fetch /api/reference?q=<relevant-topic> first.`;

/** Search across all categories and sources by keyword. */
export function searchKnowledgeSources(query: string): KnowledgeCategory[] {
  if (!query.trim()) return KNOWLEDGE_SOURCES;
  const q = query.toLowerCase();
  const results: KnowledgeCategory[] = [];
  for (const cat of KNOWLEDGE_SOURCES) {
    const catMatch = cat.name.toLowerCase().includes(q) || cat.id.includes(q);
    const matchingSources = catMatch
      ? cat.sources
      : cat.sources.filter((s) => s.name.toLowerCase().includes(q) || s.url.toLowerCase().includes(q));
    if (matchingSources.length > 0) {
      results.push({ ...cat, sources: matchingSources });
    }
  }
  return results;
}
