
This Vault is the central planning hub for my AI persona project. I will create a plan for this project, note fundamental requirements, the problem I'm looking to solve, technical aspects, and future scope.



**About the project:**

The idea is to create a mini avatar or an ai agent persona or a digital version of myself. This ai avatar should answer any questions as if I am answering them.

While a complete digital avatar would involve tons of data about myself, my life & personality, the scope of this project is hyper focused to just my resume. 

The idea is for potential recruiters to access my ai avatar and ask their questions about my profile, education, work experience, project work, technical prowess, etc. The persona should answer accurately. My resume will be the source for the avatar to refer to.



**User Requirements:**
- A portal to access the persona
- The persona should 'listen' & 'speak' to the users. Voice input & output
- The persona should answer questions about Ayush's resume



**Technical Requirements:**
1. Firstly, we need a github repo to host the source code (react & python)
2. A slick, futuristic front end code written in react
3. Hosting the front end on vercel
4. A vector database to chunk and store Ayush's resume
5. A complete RAG pipeline that takes in resume/s, and uses relevant info as context
6. A voice model for the ai avatar to use



**Points to note:**

- I want the persona to be an animation of a human, male, 25 years old, brown skin, wearing some casual, cool t shirt.
- The front end design should be of dark blue/navy blue color palette. I want a futuristic design. The persona should appear with a cool animation. Whenever the persona speaks, the mouth, eyes, eyebrows should move. This will give some basic expressions.
- The front end should have a header line that says "Welcome, this is Ayush Dodal's AI Avatar. Ask him any question about Ayush's work, education or hobbies"

---

## Project Workspace

- [[Project Plan]]: problem, requirements, implementation checklist, and acceptance.
- [[Architecture]]: frontend, avatar, retrieval, voice, and technical decisions.
- [[Setup and Deployment]]: local workflow, hosting dependencies, and release checks.
- [[Future Scope]]: next iterations and boundaries beyond the resume.

The implementation lives alongside this vault in the repository root. See `README.md` for commands. The supplied resume is stored locally in ignored `backend/data/`; the original desktop PDF is unchanged.
