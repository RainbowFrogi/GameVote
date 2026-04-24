const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const ADMIN_NAME = "Frogi";

const clients = new Map();
const suggestions = [];
const votesByIdea = new Map();

function normalizeGameName(raw) {
  return String(raw)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanupVotes() {
  const validKeys = new Set(suggestions.map((entry) => entry.key));
  for (const key of votesByIdea.keys()) {
    if (!validKeys.has(key)) {
      votesByIdea.delete(key);
    }
  }
}

function buildStateForClient(requesterId) {
  const requesterClient = requesterId
    ? Array.from(clients.values()).find((client) => client.clientId === requesterId)
    : null;

  const grouped = new Map();

  for (const entry of suggestions) {
    if (!grouped.has(entry.key)) {
      grouped.set(entry.key, {
        key: entry.key,
        title: entry.game,
        suggestionCount: 0,
        contributors: new Set(),
      });
    }

    const group = grouped.get(entry.key);
    group.suggestionCount += 1;
    group.contributors.add(entry.name);
  }

  const ideas = Array.from(grouped.values())
    .map((group) => {
      const voteSet = votesByIdea.get(group.key) || new Set();
      const contributorList = Array.from(group.contributors);
      const duplicateContributors = contributorList.length;

      return {
        key: group.key,
        title: group.title,
        suggestionCount: group.suggestionCount,
        contributors: contributorList,
        duplicateContributors,
        isDuplicate: duplicateContributors > 1,
        votes: voteSet.size,
        userVoted: requesterId ? voteSet.has(requesterId) : false,
      };
    })
    .sort((a, b) => {
      if (a.isDuplicate !== b.isDuplicate) {
        return a.isDuplicate ? -1 : 1;
      }
      if (a.votes !== b.votes) {
        return b.votes - a.votes;
      }
      return b.suggestionCount - a.suggestionCount;
    });

  const duplicateIdeaKeys = new Set(ideas.filter((idea) => idea.isDuplicate).map((idea) => idea.key));

  const submissions = suggestions
    .map((entry) => ({
      id: entry.id,
      game: entry.game,
      name: entry.name,
      isDuplicate: duplicateIdeaKeys.has(entry.key),
    }))
    .reverse();

  const participantNames = Array.from(new Set(Array.from(clients.values()).map((client) => client.name)));

  return {
    participants: participantNames,
    participantCount: participantNames.length,
    isAdmin: requesterClient ? requesterClient.name === ADMIN_NAME : false,
    ideas,
    submissions,
  };
}

function emitAllStates() {
  cleanupVotes();
  io.sockets.sockets.forEach((socket) => {
    const client = clients.get(socket.id);
    const requesterId = client ? client.clientId : null;
    socket.emit("state:update", buildStateForClient(requesterId));
  });
}

io.on("connection", (socket) => {
  socket.emit("server:connected", { message: "Connected" });

  socket.on("player:join", (payload) => {
    const name = String(payload?.name || "").trim().slice(0, 40);
    const clientId = String(payload?.clientId || "").trim().slice(0, 80);

    if (!name || !clientId) {
      return;
    }

    clients.set(socket.id, { name, clientId });
    emitAllStates();
  });

  socket.on("suggestion:add", (payload) => {
    const client = clients.get(socket.id);
    if (!client) {
      return;
    }

    const game = String(payload?.game || "").trim().slice(0, 80);
    const key = normalizeGameName(game);

    if (!key) {
      return;
    }

    suggestions.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      game,
      key,
      name: client.name,
      clientId: client.clientId,
    });

    emitAllStates();
  });

  socket.on("idea:vote", (payload) => {
    const client = clients.get(socket.id);
    if (!client) {
      return;
    }

    const key = String(payload?.key || "").trim();
    if (!key) {
      return;
    }

    let set = votesByIdea.get(key);
    if (!set) {
      set = new Set();
      votesByIdea.set(key, set);
    }

    if (set.has(client.clientId)) {
      set.delete(client.clientId);
    } else {
      set.add(client.clientId);
    }

    emitAllStates();
  });

  socket.on("admin:clear-submissions", () => {
    const client = clients.get(socket.id);
    if (!client || client.name !== ADMIN_NAME) {
      return;
    }

    suggestions.length = 0;
    votesByIdea.clear();
    emitAllStates();
  });

  socket.on("disconnect", () => {
    clients.delete(socket.id);
    emitAllStates();
  });
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

server.listen(PORT, () => {
  console.log(`Game selector app running on http://localhost:${PORT}`);
});
