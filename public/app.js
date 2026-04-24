const socket = io();

const joinForm = document.getElementById("joinForm");
const suggestionForm = document.getElementById("suggestionForm");
const nameInput = document.getElementById("nameInput");
const gameInput = document.getElementById("gameInput");
const joinStatus = document.getElementById("joinStatus");
const participantCount = document.getElementById("participantCount");
const ideasEl = document.getElementById("ideas");
const submissionsEl = document.getElementById("submissions");

const storedName = localStorage.getItem("game-selector-name") || "";
const clientId = getOrCreateClientId();

let me = storedName;

if (storedName) {
  nameInput.value = storedName;
}

socket.on("connect", () => {
  if (me) {
    socket.emit("player:join", { name: me, clientId });
    setJoinStatus(`Joined as ${me}`);
  }
});

socket.on("state:update", (state) => {
  renderState(state);
});

joinForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const name = nameInput.value.trim();
  if (!name) {
    return;
  }

  me = name;
  localStorage.setItem("game-selector-name", name);

  socket.emit("player:join", { name, clientId });
  setJoinStatus(`Joined as ${name}`);
});

suggestionForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!me) {
    setJoinStatus("Join first so your friends can see your suggestions.");
    return;
  }

  const game = gameInput.value.trim();
  if (!game) {
    return;
  }

  socket.emit("suggestion:add", { game });
  gameInput.value = "";
  gameInput.focus();
});

function renderState(state) {
  participantCount.textContent = `${state.participantCount} players online`;
  renderIdeas(state.ideas);
  renderSubmissions(state.submissions);
}

function renderIdeas(ideas) {
  ideasEl.innerHTML = "";

  if (!ideas.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No ideas yet. Start with a suggestion above.";
    ideasEl.appendChild(empty);
    return;
  }

  for (const idea of ideas) {
    const card = document.createElement("article");
    card.className = "idea";

    if (idea.isDuplicate) {
      card.classList.add("duplicate");
    }

    if (idea.userVoted) {
      card.classList.add("voted");
    }

    const head = document.createElement("div");
    head.className = "idea-head";

    const title = document.createElement("h3");
    title.className = "idea-title";
    title.textContent = idea.title;

    head.appendChild(title);

    if (idea.isDuplicate) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = `Match: ${idea.duplicateContributors} people suggested this`;
      head.appendChild(badge);
    }

    const contributors = document.createElement("p");
    contributors.textContent = `Suggested by: ${idea.contributors.join(", ")}`;

    const foot = document.createElement("div");
    foot.className = "idea-foot";

    const votesText = document.createElement("strong");
    votesText.textContent = `${idea.votes} vote${idea.votes === 1 ? "" : "s"}`;

    const voteButton = document.createElement("button");
    voteButton.type = "button";
    voteButton.className = "secondary";
    voteButton.textContent = idea.userVoted ? "Remove Vote" : "Vote";
    voteButton.disabled = !me;
    voteButton.addEventListener("click", () => {
      socket.emit("idea:vote", { key: idea.key });
    });

    foot.appendChild(votesText);
    foot.appendChild(voteButton);

    card.appendChild(head);
    card.appendChild(contributors);
    card.appendChild(foot);

    ideasEl.appendChild(card);
  }
}

function renderSubmissions(submissions) {
  submissionsEl.innerHTML = "";

  if (!submissions.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No submissions yet.";
    submissionsEl.appendChild(empty);
    return;
  }

  for (const entry of submissions) {
    const row = document.createElement("article");
    row.className = "submission";

    if (entry.isDuplicate) {
      row.classList.add("duplicate");
    }

    const line = document.createElement("p");
    line.textContent = `${entry.name} suggested ${entry.game}`;

    row.appendChild(line);
    submissionsEl.appendChild(row);
  }
}

function setJoinStatus(message) {
  joinStatus.textContent = message;
}

function getOrCreateClientId() {
  const saved = localStorage.getItem("game-selector-id");
  if (saved) {
    return saved;
  }

  const created =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `guest-${Math.random().toString(36).slice(2, 12)}`;

  localStorage.setItem("game-selector-id", created);
  return created;
}
