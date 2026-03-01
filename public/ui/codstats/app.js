(() => {
  const ROOT = document.querySelector("[data-template]");

  if (!ROOT) {
    return;
  }

  const TEMPLATE = ROOT.getAttribute("data-template") || "widget";
  const NUMBER_FORMAT = new Intl.NumberFormat("en-US");
  const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  let latestToolOutput = asObject(window.openai && window.openai.toolOutput);
  let latestToolMeta = asObject(window.openai && window.openai.toolResponseMetadata);

  function asObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    return value;
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function toText(value) {
    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  function toNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function toInteger(value) {
    const numeric = toNumber(value);
    return numeric === null ? null : Math.trunc(numeric);
  }

  function toBoolean(value) {
    return value === true;
  }

  function titleCase(raw) {
    const text = toText(raw);
    if (!text) {
      return "Unknown";
    }

    return text
      .split(/[\s_]+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  }

  function formatInteger(value) {
    const parsed = toInteger(value);
    return parsed === null ? "--" : NUMBER_FORMAT.format(parsed);
  }

  function formatDecimal(value, digits = 2) {
    const parsed = toNumber(value);
    return parsed === null ? "--" : parsed.toFixed(digits);
  }

  function formatDelta(value, suffix = "") {
    const parsed = toInteger(value);
    if (parsed === null) {
      return "--";
    }

    const sign = parsed > 0 ? "+" : "";
    return `${sign}${NUMBER_FORMAT.format(parsed)}${suffix}`;
  }

  function formatDateTime(value) {
    const parsed = toNumber(value);
    if (parsed === null) {
      return "--";
    }

    try {
      return TIME_FORMAT.format(new Date(parsed));
    } catch {
      return "--";
    }
  }

  function formatRange(range) {
    const entry = asObject(range);
    if (!entry) {
      return "--";
    }

    const minSr = toInteger(entry.minSr);
    const rawMaxSr = entry.maxSr;
    const maxSr = rawMaxSr === null ? null : toInteger(rawMaxSr);

    if (minSr === null || (rawMaxSr !== null && maxSr === null)) {
      return "--";
    }

    if (maxSr === null) {
      return `${NUMBER_FORMAT.format(minSr)}+ SR`;
    }

    return `${NUMBER_FORMAT.format(minSr)}\u2013${NUMBER_FORMAT.format(maxSr)} SR`;
  }

  function computeProgressValue(currentSr, currentMin, targetMin) {
    const fromSr = toInteger(currentSr);
    const minSr = toInteger(currentMin);
    const nextMinSr = toInteger(targetMin);

    if (fromSr === null || minSr === null || nextMinSr === null) {
      return null;
    }

    const span = nextMinSr - minSr;
    if (span <= 0) {
      return null;
    }

    const progress = ((fromSr - minSr) / span) * 100;
    return Math.max(0, Math.min(100, progress));
  }

  function setText(id, value) {
    const node = document.getElementById(id);
    if (!node) {
      return;
    }

    node.textContent = value;
  }

  function setHidden(id, hidden) {
    const node = document.getElementById(id);
    if (!node) {
      return;
    }

    node.classList.toggle("is-hidden", hidden);
  }

  function setPolarityClass(id, value) {
    const node = document.getElementById(id);
    if (!node) {
      return;
    }

    const parsed = toNumber(value);
    node.classList.remove("codstats-positive", "codstats-negative");

    if (parsed === null || parsed === 0) {
      return;
    }

    node.classList.add(parsed > 0 ? "codstats-positive" : "codstats-negative");
  }

  function setProgress(id, value) {
    const node = document.getElementById(id);
    if (!node) {
      return;
    }

    const parsed = toNumber(value);
    const clamped = parsed === null ? 0 : Math.max(0, Math.min(100, parsed));
    node.style.width = `${clamped}%`;
  }

  function getViewModel() {
    const codstatsMeta = asObject(asObject(latestToolMeta) && latestToolMeta.codstats);
    const fromMeta = asObject(codstatsMeta && codstatsMeta.viewModel);
    if (fromMeta) {
      return fromMeta;
    }

    const output = asObject(latestToolOutput);
    const fallbackData = asObject(output && output.data);
    return fallbackData || {};
  }

  function syncGlobals() {
    const currentOutput = asObject(window.openai && window.openai.toolOutput);
    const currentMeta = asObject(window.openai && window.openai.toolResponseMetadata);

    if (currentOutput) {
      latestToolOutput = currentOutput;
    }

    if (currentMeta) {
      latestToolMeta = currentMeta;
    }
  }

  function applyToolResult(result) {
    const normalized = asObject(result);
    if (!normalized) {
      return;
    }

    const structuredContent = asObject(normalized.structuredContent);
    const meta = asObject(normalized._meta);

    if (structuredContent) {
      latestToolOutput = structuredContent;
    }

    if (meta) {
      latestToolMeta = meta;
    }

    render();
  }

  async function callTool(name, args, sourceButton) {
    const openai = window.openai;
    if (!openai || typeof openai.callTool !== "function") {
      return null;
    }

    if (sourceButton) {
      sourceButton.disabled = true;
    }

    try {
      const result = await openai.callTool(name, args || {});
      applyToolResult(result);
      return result;
    } catch {
      return null;
    } finally {
      if (sourceButton) {
        sourceButton.disabled = false;
      }
    }
  }

  function readToolArgs(node) {
    const rawArgs = node.getAttribute("data-tool-args");
    if (!rawArgs) {
      return {};
    }

    try {
      const parsed = JSON.parse(rawArgs);
      return asObject(parsed) || {};
    } catch {
      return {};
    }
  }

  function bindGenericToolButtons() {
    const buttons = document.querySelectorAll("[data-tool]");

    for (const button of buttons) {
      if (button.__codstatsBound === true) {
        continue;
      }

      button.__codstatsBound = true;
      button.addEventListener("click", async () => {
        const toolName = button.getAttribute("data-tool");
        if (!toolName) {
          return;
        }

        await callTool(toolName, readToolArgs(button), button);
      });
    }
  }

  function renderWidget(viewModel) {
    const tab = toText(viewModel.tab) || "overview";
    const tabLabel = titleCase(tab);

    setText("widget-tab-pill", tabLabel);

    let subtitle = "Live ranked snapshot for your linked account.";
    if (tab === "matches") {
      subtitle = "Focused on match history and momentum shifts.";
    }
    if (tab === "rank") {
      subtitle = "Focused on rank climb targets and SR thresholds.";
    }
    if (tab === "settings") {
      subtitle = "Focused on account link health and control actions.";
    }

    setText("widget-subtitle", subtitle);

    const session = asObject(viewModel.session) || {};
    const rank = asObject(viewModel.rank) || {};
    const connection = asObject(viewModel.connection) || {};
    const recentMatches = asArray(viewModel.recentMatches)
      .map((entry) => asObject(entry))
      .filter((entry) => entry !== null)
      .slice(0, 5);

    const wins = toInteger(session.wins);
    const losses = toInteger(session.losses);

    setText("widget-session-sr", formatInteger(session.srCurrent));
    setText("widget-session-sr-change", formatDelta(session.srChange));
    setText("widget-session-matches", formatInteger(session.matches));
    setText(
      "widget-session-wl",
      wins === null || losses === null
        ? "--"
        : `${NUMBER_FORMAT.format(wins)}-${NUMBER_FORMAT.format(losses)}`,
    );
    setText("widget-session-kd", formatDecimal(session.kd, 2));
    setText("widget-session-kills", formatInteger(session.kills));
    setText("widget-session-deaths", formatInteger(session.deaths));
    setText("widget-session-best-streak", formatInteger(session.bestStreak));
    setText("widget-session-started-at", formatDateTime(session.startedAt));
    setPolarityClass("widget-session-sr-change", session.srChange);

    setText("widget-rank-current", toText(rank.currentRank) || "--");
    setText("widget-rank-current-sr", formatInteger(rank.currentSr));
    const widgetNextTier =
      toText(rank.nextTierTarget) ||
      toText(rank.nextDivisionTarget) ||
      toText(rank.nextRankTarget);
    setText("widget-rank-next-division", widgetNextTier || "--");
    setText("widget-rank-next-rank", widgetNextTier || "--");
    const widgetSrNeeded = toInteger(rank.srNeeded);
    setText(
      "widget-rank-sr-needed",
      widgetSrNeeded === null
        ? widgetNextTier
          ? "At max tier"
          : "--"
        : `${NUMBER_FORMAT.format(widgetSrNeeded)} SR`,
    );

    const matchListNode = document.getElementById("widget-matches-list");
    const matchTemplate = document.getElementById("codstats-widget-match-row-template");

    if (matchListNode) {
      matchListNode.textContent = "";

      for (const entry of recentMatches) {
        let row = null;

        if (matchTemplate && matchTemplate.content) {
          row = matchTemplate.content.firstElementChild.cloneNode(true);
        }

        if (!row) {
          row = document.createElement("li");
          row.className = "codstats-widget-match-row";
        }

        const mode = toText(entry.mode) || "Ranked";
        const outcome = toText(entry.outcome);
        const summary = outcome ? `${titleCase(mode)} | ${titleCase(outcome)}` : titleCase(mode);
        const srValue = toInteger(entry.srDelta);

        const summaryNode = row.querySelector("[data-field='summary']");
        const srNode = row.querySelector("[data-field='srDelta']");
        const kdNode = row.querySelector("[data-field='kd']");
        const playedAtNode = row.querySelector("[data-field='playedAt']");

        if (summaryNode) {
          summaryNode.textContent = summary;
        }

        if (srNode) {
          srNode.textContent = formatDelta(srValue);
          srNode.classList.remove("codstats-positive", "codstats-negative");
          if (srValue !== null) {
            srNode.classList.add(srValue >= 0 ? "codstats-positive" : "codstats-negative");
          }
        }

        if (kdNode) {
          kdNode.textContent = `KD ${formatDecimal(entry.kd, 2)}`;
        }

        if (playedAtNode) {
          playedAtNode.textContent = formatDateTime(entry.playedAt);
        }

        matchListNode.appendChild(row);
      }
    }

    setHidden("widget-matches-empty", recentMatches.length > 0);

    const connected = toBoolean(connection.connected);
    const statusText = toText(connection.status) || (connected ? "Connected" : "Disconnected");
    const actionsHint =
      toText(connection.actionsHint) ||
      (connected
        ? "Open settings to review scopes. Use disconnect to revoke this ChatGPT link."
        : "Open settings to connect your CodStats account.");

    setText("widget-connection-status", statusText);
    setText("widget-actions-hint", actionsHint);

    const statusNode = document.getElementById("widget-connection-status");
    if (statusNode) {
      statusNode.classList.toggle("codstats-pill-accent", connected);
    }

    const disconnectButton = document.getElementById("widget-disconnect-button");
    if (disconnectButton) {
      disconnectButton.disabled = !connected;
    }
  }

  function renderSession(viewModel) {
    const source = toText(viewModel.source) || "current";
    const active = toBoolean(viewModel.active);
    const found = source === "last" ? toBoolean(viewModel.found) : true;
    const hasSessionStats =
      toNumber(viewModel.srCurrent) !== null ||
      toInteger(viewModel.wins) !== null ||
      toInteger(viewModel.losses) !== null;

    const gameTitle = toText(viewModel.gameTitle) || "Session";
    const season = toInteger(viewModel.season);
    const titleSuffix = season === null ? "" : ` S${season}`;

    setText("session-title", `${gameTitle}${titleSuffix}`);
    setText(
      "session-subtitle",
      source === "last"
        ? found
          ? "Most recent completed session."
          : "No completed session was found."
        : source === "open"
          ? "Use quick actions to load a ranked session."
          : active
            ? "Active ranked session data."
            : "No active session is running right now.",
    );

    const status = active && source !== "last" ? "Active" : "Inactive";
    setText("session-status-pill", status);

    const shouldShowEmpty =
      source === "open" ||
      (source === "current" && !active) ||
      (source === "last" && !found) ||
      !hasSessionStats;

    setHidden("session-empty-state", !shouldShowEmpty);
    setText(
      "session-empty-copy",
      source === "last" && !found
        ? "No completed session was found. Run more matches and try again."
        : "Start a ranked run to fill this panel with live stats.",
    );

    const wins = toInteger(viewModel.wins);
    const losses = toInteger(viewModel.losses);
    const kills = toInteger(viewModel.kills);
    const deaths = toInteger(viewModel.deaths);

    setText("session-sr-current", formatInteger(viewModel.srCurrent));
    setText("session-sr-delta", formatDelta(viewModel.srDelta));
    setText(
      "session-wl",
      wins === null || losses === null
        ? "--"
        : `${NUMBER_FORMAT.format(wins)}-${NUMBER_FORMAT.format(losses)}`,
    );
    setText("session-kd", formatDecimal(viewModel.kd, 2));
    setText(
      "session-kd-count",
      kills === null || deaths === null
        ? "--"
        : `${NUMBER_FORMAT.format(kills)} / ${NUMBER_FORMAT.format(deaths)}`,
    );
    setText("session-best-streak", formatInteger(viewModel.bestStreak));
    setText("session-start-time", formatDateTime(viewModel.startedAt));
    setText("session-last-updated", formatDateTime(viewModel.lastUpdatedAt));

    setPolarityClass("session-sr-delta", viewModel.srDelta);

    const highlightsNode = document.getElementById("session-highlights");
    const highlights = asArray(viewModel.highlights)
      .map((entry) => asObject(entry))
      .filter((entry) => entry !== null)
      .slice(0, 3);

    if (highlightsNode) {
      highlightsNode.textContent = "";

      for (const highlight of highlights) {
        const item = document.createElement("li");
        item.className = "codstats-highlight-item";

        const srDelta = toInteger(highlight.srDelta);
        const left = document.createElement("span");
        left.className = "codstats-highlight-meta";

        const mode = toText(highlight.mode);
        const outcome = toText(highlight.outcome);
        const playedAt = formatDateTime(highlight.playedAt);
        const parts = [];

        if (mode) {
          parts.push(titleCase(mode));
        }

        if (outcome) {
          parts.push(titleCase(outcome));
        }

        if (playedAt !== "--") {
          parts.push(playedAt);
        }

        left.textContent = parts.length > 0 ? parts.join(" | ") : "Recent match";

        const right = document.createElement("strong");
        right.textContent = srDelta === null ? "--" : formatDelta(srDelta);

        if (srDelta !== null) {
          right.classList.add(srDelta >= 0 ? "codstats-positive" : "codstats-negative");
        }

        item.appendChild(left);
        item.appendChild(right);
        highlightsNode.appendChild(item);
      }
    }

    setHidden("session-highlights-empty", highlights.length > 0);
  }

  function renderMatches(viewModel) {
    const listNode = document.getElementById("matches-list");
    const templateNode = document.getElementById("codstats-match-template");
    const items = asArray(viewModel.items)
      .map((item) => asObject(item))
      .filter((item) => item !== null)
      .slice(0, 15);

    setText("matches-count-pill", `${items.length} loaded`);

    if (listNode) {
      listNode.textContent = "";

      if (items.length === 0) {
        const emptyCard = document.createElement("article");
        emptyCard.className = "codstats-card";
        emptyCard.textContent = "No matches available for this page.";
        listNode.appendChild(emptyCard);
      }

      for (const item of items) {
        let card = null;

        if (templateNode && templateNode.content) {
          card = templateNode.content.firstElementChild.cloneNode(true);
        }

        if (!card) {
          card = document.createElement("article");
          card.className = "codstats-card codstats-match-card";
        }

        const mode = titleCase(item.mode || "mode");
        const map = toText(item.map) || "Map unavailable";
        const outcome = toText(item.outcome) || "pending";

        const modeNode = card.querySelector("[data-field='mode']");
        const mapNode = card.querySelector("[data-field='map']");
        const resultNode = card.querySelector("[data-field='result']");
        const srDeltaNode = card.querySelector("[data-field='srDelta']");
        const kdCountNode = card.querySelector("[data-field='kdCount']");
        const kdNode = card.querySelector("[data-field='kd']");
        const playedAtNode = card.querySelector("[data-field='playedAt']");

        if (modeNode) {
          modeNode.textContent = mode;
        }
        if (mapNode) {
          mapNode.textContent = map;
        }
        if (resultNode) {
          resultNode.textContent = titleCase(outcome);
          resultNode.classList.remove("codstats-result-win", "codstats-result-loss");
          if (outcome === "win") {
            resultNode.classList.add("codstats-result-win");
          }
          if (outcome === "loss") {
            resultNode.classList.add("codstats-result-loss");
          }
        }
        if (srDeltaNode) {
          srDeltaNode.textContent = formatDelta(item.srDelta);
          srDeltaNode.classList.remove("codstats-positive", "codstats-negative");
          const srValue = toInteger(item.srDelta);
          if (srValue !== null) {
            srDeltaNode.classList.add(srValue >= 0 ? "codstats-positive" : "codstats-negative");
          }
        }

        const kills = toInteger(item.kills);
        const deaths = toInteger(item.deaths);
        if (kdCountNode) {
          kdCountNode.textContent =
            kills === null || deaths === null
              ? "--"
              : `${NUMBER_FORMAT.format(kills)} / ${NUMBER_FORMAT.format(deaths)}`;
        }
        if (kdNode) {
          kdNode.textContent = formatDecimal(item.kd, 2);
        }
        if (playedAtNode) {
          playedAtNode.textContent = formatDateTime(item.playedAt);
        }

        listNode.appendChild(card);
      }
    }

    const hasMore = toBoolean(viewModel.hasMore);
    const hintFromPayload = toText(viewModel.nextCursorHint);

    setText(
      "matches-next-status",
      hasMore ? "There are more matches." : "No more matches.",
    );
    setText(
      "matches-next-hint",
      hintFromPayload ||
        (hasMore
          ? "There are more matches. Please use the codstats_get_match_history tool again with the next cursor to load them."
          : "Run codstats_get_match_history again to refresh this feed."),
    );

    const nextButton = document.getElementById("matches-next-button");
    if (nextButton) {
      nextButton.classList.add("is-hidden");
    }
  }

  function renderRank(viewModel) {
    const current = asObject(viewModel.current);
    const nextDivision =
      asObject(viewModel.nextDivision) ||
      asObject(viewModel.next);
    const nextRank =
      asObject(viewModel.nextRank) ||
      nextDivision;

    const currentRank = toText(current && current.rank);
    const currentDivision = toText(current && current.division);
    const currentDisplayName =
      toText(current && current.displayName) ||
      (currentRank
        ? `${currentRank}${currentDivision ? ` ${currentDivision}` : ""}`
        : null);
    const currentTierLabel = currentDisplayName || "Unranked";

    const nextDivisionRank = toText(nextDivision && nextDivision.rank);
    const nextDivisionTier = toText(nextDivision && nextDivision.division);
    const nextDivisionLabel =
      toText(nextDivision && nextDivision.displayName) ||
      (nextDivisionRank
        ? `${nextDivisionRank}${nextDivisionTier ? ` ${nextDivisionTier}` : ""}`
        : null);

    const nextRankName = toText(nextRank && nextRank.rank);
    const nextRankTier = toText(nextRank && nextRank.division);
    const nextRankLabel =
      toText(nextRank && nextRank.displayName) ||
      (nextRankName
        ? `${nextRankName}${nextRankTier ? ` ${nextRankTier}` : ""}`
        : null);

    const currentSr = toInteger(viewModel.currentSr);
    const currentMinSr = toInteger(current && current.minSr);
    const nextDivisionMinSr = toInteger(nextDivision && nextDivision.minSr);
    const nextRankMinSr = toInteger(nextRank && nextRank.minSr);

    const srToNextDivision =
      toInteger(viewModel.srToNextDivision) ??
      toInteger(nextDivision && nextDivision.srNeeded) ??
      (currentSr !== null && nextDivisionMinSr !== null
        ? Math.max(0, nextDivisionMinSr - currentSr)
        : null);

    const srToNextRank =
      toInteger(viewModel.srToNextRank) ??
      toInteger(nextRank && nextRank.srNeeded) ??
      (currentSr !== null && nextRankMinSr !== null
        ? Math.max(0, nextRankMinSr - currentSr)
        : null);

    const srToNextTier =
      toInteger(viewModel.srToNextTier) ??
      srToNextDivision;

    const progressToNextDivision =
      toNumber(viewModel.progressToNextDivision) ??
      computeProgressValue(currentSr, currentMinSr, nextDivisionMinSr);

    const progressToNextRank =
      toNumber(viewModel.progressToNextRank) ??
      computeProgressValue(currentSr, currentMinSr, nextRankMinSr);

    const progressToNextTier =
      toNumber(viewModel.progressToNextTier) ??
      progressToNextDivision;

    const nextThresholdText =
      nextRankLabel &&
      nextDivisionLabel &&
      nextRankLabel !== nextDivisionLabel &&
      nextRankMinSr !== null &&
      nextDivisionMinSr !== null
        ? `Division at ${NUMBER_FORMAT.format(nextDivisionMinSr)} SR · Rank at ${NUMBER_FORMAT.format(nextRankMinSr)} SR`
        : nextDivisionMinSr === null
          ? ""
          : `Reach ${NUMBER_FORMAT.format(nextDivisionMinSr)} SR`;

    setText("rank-title", toText(viewModel.title) || "Rank Progress");
    setText(
      "rank-ruleset",
      toText(viewModel.ruleset) || "Live ladder state from the configured SR ruleset.",
    );
    setText("rank-current-tier", currentTierLabel);
    setText("rank-current-division", currentTierLabel);
    setText("rank-current-range", formatRange(current));
    setText("rank-current-sr", formatInteger(currentSr));
    setProgress("rank-tier-progress-fill", progressToNextTier);
    setText(
      "rank-tier-progress-label",
      progressToNextDivision === null
        ? "Progress unavailable"
        : `${Math.round(progressToNextDivision)}% through this division`,
    );

    setText(
      "rank-next-division-needed",
      srToNextDivision === null
        ? "--"
        : `${NUMBER_FORMAT.format(srToNextDivision)} SR`,
    );
    setText(
      "rank-next-rank-needed",
      srToNextRank === null
        ? "--"
        : `${NUMBER_FORMAT.format(srToNextRank)} SR`,
    );
    setProgress("rank-next-division-fill", progressToNextDivision);
    setProgress("rank-next-rank-fill", progressToNextRank);

    if (nextDivisionLabel) {
      setHidden("rank-next-tier-section", false);
      setHidden("rank-next-sr-section", false);
      setHidden("rank-progress-targets", false);
      setText("rank-next-tier", nextDivisionLabel);
      setText("rank-next-range", formatRange(nextDivision));
      setText(
        "rank-sr-to-next",
        srToNextTier === null
          ? "--"
          : `${NUMBER_FORMAT.format(srToNextTier)} SR`,
      );
      setText("rank-next-threshold", nextThresholdText);
      return;
    }

    setHidden("rank-next-tier-section", true);
    setHidden("rank-next-sr-section", true);
    setHidden("rank-progress-targets", true);
    setText("rank-next-tier", "--");
    setText("rank-next-range", "--");
    setText("rank-sr-to-next", "--");
    setText("rank-next-threshold", "");
  }

  function resetDisconnectState() {
    setHidden("settings-disconnect-trigger", false);
    setHidden("settings-disconnect-confirm", true);
    setHidden("settings-disconnect-cancel", true);
  }

  function renderSettings(viewModel) {
    const connected = toBoolean(viewModel.connected);
    const linked = toBoolean(viewModel.chatgptLinked);

    setText("settings-status-pill", connected ? "Connected" : "Disconnected");
    setText("settings-connection-value", linked ? "Linked" : connected ? "Connected" : "Not linked");
    setText("settings-plan-value", titleCase(viewModel.plan || "free"));
    setText("settings-discord-value", toText(viewModel.discordIdMasked) || "Not available");
    setText("settings-last-sync-value", formatDateTime(viewModel.lastSyncAt));
    setText("settings-user-value", toText(viewModel.name) || "CodStats User");
    setText("settings-feedback", "Disconnect requires confirmation.");

    const statusNode = document.getElementById("settings-status-pill");
    if (statusNode) {
      statusNode.classList.toggle("codstats-pill-accent", connected);
    }

    if (!connected) {
      setHidden("settings-disconnect-trigger", true);
      setHidden("settings-disconnect-confirm", true);
      setHidden("settings-disconnect-cancel", true);
      return;
    }

    resetDisconnectState();
  }

  function bindSettingsDisconnectButtons() {
    const triggerButton = document.getElementById("settings-disconnect-trigger");
    const confirmButton = document.getElementById("settings-disconnect-confirm");
    const cancelButton = document.getElementById("settings-disconnect-cancel");

    if (triggerButton && triggerButton.__codstatsBound !== true) {
      triggerButton.__codstatsBound = true;
      triggerButton.addEventListener("click", () => {
        setHidden("settings-disconnect-trigger", true);
        setHidden("settings-disconnect-confirm", false);
        setHidden("settings-disconnect-cancel", false);
        setText("settings-feedback", "Confirm to disconnect your CodStats app link.");
      });
    }

    if (cancelButton && cancelButton.__codstatsBound !== true) {
      cancelButton.__codstatsBound = true;
      cancelButton.addEventListener("click", () => {
        resetDisconnectState();
        setText("settings-feedback", "Disconnect requires confirmation.");
      });
    }

    if (confirmButton && confirmButton.__codstatsBound !== true) {
      confirmButton.__codstatsBound = true;
      confirmButton.addEventListener("click", async () => {
        setText("settings-feedback", "Disconnecting...");

        const disconnectResult = await callTool(
          "codstats_disconnect",
          { confirm: true },
          confirmButton,
        );

        if (!disconnectResult || disconnectResult.isError === true) {
          setText("settings-feedback", "Disconnect failed. Try again.");
          resetDisconnectState();
          return;
        }

        setText("settings-feedback", "Disconnected. Refreshing settings...");
        await callTool("codstats_get_settings", {}, null);
      });
    }
  }

  function render() {
    syncGlobals();
    const viewModel = getViewModel();

    if (TEMPLATE === "session") {
      renderSession(viewModel);
    } else if (TEMPLATE === "matches") {
      renderMatches(viewModel);
    } else if (TEMPLATE === "rank") {
      renderRank(viewModel);
    } else if (TEMPLATE === "settings") {
      renderSettings(viewModel);
    } else {
      renderWidget(viewModel);
    }

    bindGenericToolButtons();
    bindSettingsDisconnectButtons();

    const openai = window.openai;
    if (openai && typeof openai.notifyIntrinsicHeight === "function") {
      try {
        openai.notifyIntrinsicHeight();
      } catch {
        // Ignore runtime sizing failures.
      }
    }
  }

  window.addEventListener(
    "openai:set_globals",
    (event) => {
      const globals = asObject(event && event.detail && event.detail.globals);
      if (!globals) {
        return;
      }

      const nextOutput = asObject(globals.toolOutput);
      const nextMeta = asObject(globals.toolResponseMetadata);

      if (nextOutput) {
        latestToolOutput = nextOutput;
      }

      if (nextMeta) {
        latestToolMeta = nextMeta;
      }

      render();
    },
    { passive: true },
  );

  window.addEventListener(
    "message",
    (event) => {
      if (event.source !== window.parent) {
        return;
      }

      const message = asObject(event.data);
      if (!message || message.jsonrpc !== "2.0") {
        return;
      }

      if (message.method !== "ui/notifications/tool-result") {
        return;
      }

      const params = asObject(message.params);
      if (!params) {
        return;
      }

      applyToolResult(params);
    },
    { passive: true },
  );

  render();
})();
