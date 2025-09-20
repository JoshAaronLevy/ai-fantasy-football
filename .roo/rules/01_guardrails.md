## IMPORTANT GUARDRAILS

- **Do NOT** automatically change the selected model. Stick to the currently selected model throughout the entirety of the task. If you feel you must change the model, explain why and get confirmation first.
- **Do NOT** write any tests. I will write the tests after you have completed the code.
- **Do NOT** try to start a new dev server via `npm start`, `npm run dev`, or any other command or script.
- **Do NOT** attempt to do any tests yourself, in the browser, or via curl, or any other method. If you need to test something, give me the curl or instructions and ask me to do it and wait for my response on what happened after I tested it.
- **Do NOT** over-engineer any code changes or new features. For instance:
  - Do not automatically add new files unless the prompt specifically mentions doing so. If the prompt is unclear, and you think a new file is needed, ask me first, and include why you want to add the new file.
  - Do not implement any environment-specific code changes (like special environment-specific feature flags, or environment-specific logging, etc). This is only going to be used in a development environment, so no need to add any environment-specific conditional code.
- **Do NOT** leave a mess of documentation files, one-off test scripts, etc. in the codebase. If you need to write a script or documentation, ask me first, and I will tell you where to put it.