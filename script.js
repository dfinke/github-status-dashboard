// Constants
const REFRESH_INTERVAL = 15000; // 15 seconds

// State variables
let refreshIntervalId = null;
let repository = '';
let token = '';

// DOM Elements
const repoInput = document.getElementById('repo-input');
const tokenInput = document.getElementById('token-input');
const saveSettingsBtn = document.getElementById('save-settings');
const refreshNowBtn = document.getElementById('refresh-now');
const prContainer = document.getElementById('pr-container');
const actionsContainer = document.getElementById('actions-container');
const lastRefreshEl = document.getElementById('last-refresh');
const refreshStatusEl = document.getElementById('refresh-status');
const notificationEl = document.getElementById('notification');

// Event Listeners
document.addEventListener('DOMContentLoaded', initialize);
saveSettingsBtn.addEventListener('click', saveSettings);
refreshNowBtn.addEventListener('click', refreshData);

// Functions
function initialize() {
    // Load settings from localStorage if available
    const savedRepo = localStorage.getItem('github-dashboard-repo');
    const savedToken = localStorage.getItem('github-dashboard-token');

    if (savedRepo) repoInput.value = savedRepo;
    if (savedToken) tokenInput.value = savedToken;

    if (savedRepo && savedToken) {
        repository = savedRepo;
        token = savedToken;
        startAutoRefresh();
        refreshData();
    }
}

function saveSettings() {
    repository = repoInput.value.trim();
    token = tokenInput.value.trim();

    if (!repository || !token) {
        showNotification('Please enter both repository and token', 'error');
        return;
    }

    // Validate repository format
    if (!repository.includes('/')) {
        showNotification('Repository should be in format "owner/repo"', 'error');
        return;
    }

    // Save to localStorage
    localStorage.setItem('github-dashboard-repo', repository);
    localStorage.setItem('github-dashboard-token', token);

    // Restart refresh cycle
    startAutoRefresh();
    refreshData();
    showNotification('Settings saved!', 'success');
}

function startAutoRefresh() {
    // Clear any existing interval
    if (refreshIntervalId) {
        clearInterval(refreshIntervalId);
    }

    // Start new interval
    refreshIntervalId = setInterval(refreshData, REFRESH_INTERVAL);
    refreshStatusEl.textContent = `Auto-refresh: On (15s)`;
}

function stopAutoRefresh() {
    if (refreshIntervalId) {
        clearInterval(refreshIntervalId);
        refreshIntervalId = null;
    }
    refreshStatusEl.textContent = 'Auto-refresh: Off';
}

async function refreshData() {
    if (!repository || !token) {
        showNotification('Please configure repository and token first', 'error');
        return;
    }

    updateLastRefreshTime();

    try {
        await Promise.all([
            fetchPullRequests(),
            fetchWorkflowRuns()
        ]);
    } catch (error) {
        console.error('Error refreshing data:', error);
        showNotification('Error refreshing data. Check console for details.', 'error');
    }
}

function updateLastRefreshTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    lastRefreshEl.textContent = `Last refreshed: ${timeString}`;
}

async function fetchPullRequests() {
    prContainer.innerHTML = '<div class="loading">Loading pull requests...</div>';

    try {
        const response = await fetch(`https://api.github.com/repos/${repository}/pulls`, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const pullRequests = await response.json();

        if (pullRequests.length === 0) {
            prContainer.innerHTML = '<div class="error">No pull requests found.</div>';
            return;
        }

        displayPullRequests(pullRequests);
    } catch (error) {
        console.error('Error fetching pull requests:', error);
        prContainer.innerHTML = `<div class="error">Error loading pull requests: ${error.message}</div>`;
    }
}

async function fetchWorkflowRuns() {
    actionsContainer.innerHTML = '<div class="loading">Loading workflow runs...</div>';

    try {
        const response = await fetch(`https://api.github.com/repos/${repository}/actions/runs`, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const workflowRuns = data.workflow_runs || [];

        if (workflowRuns.length === 0) {
            actionsContainer.innerHTML = '<div class="error">No workflow runs found.</div>';
            return;
        }

        displayWorkflowRuns(workflowRuns);
    } catch (error) {
        console.error('Error fetching workflow runs:', error);
        actionsContainer.innerHTML = `<div class="error">Error loading workflow runs: ${error.message}</div>`;
    }
}

function displayPullRequests(pullRequests) {
    prContainer.innerHTML = '';

    pullRequests.forEach(pr => {
        const card = document.createElement('div');
        card.className = 'card';

        // Get the right status badge class
        const statusClass = pr.draft ? 'badge-neutral' :
            pr.mergeable ? 'badge-success' : 'badge-pending';

        const statusText = pr.draft ? 'Draft' :
            pr.mergeable === null ? 'Checking' :
                pr.mergeable ? 'Ready to merge' : 'Merge conflict';

        // Format the date
        const createdDate = new Date(pr.created_at);
        const dateString = createdDate.toLocaleDateString();

        card.innerHTML = `
            <div class="card-header">
                <div class="card-title">
                    <a href="${pr.html_url}" target="_blank">#${pr.number}: ${escapeHtml(pr.title)}</a>
                </div>
                <span class="badge ${statusClass}">${statusText}</span>
            </div>
            <div class="card-meta">
                Opened by ${escapeHtml(pr.user.login)} on ${dateString}
            </div>
            <div class="card-content">
                ${pr.body ? escapeHtml(truncateText(pr.body, 100)) : 'No description provided.'}
            </div>
        `;

        prContainer.appendChild(card);
    });
}

function displayWorkflowRuns(workflowRuns) {
    actionsContainer.innerHTML = '';

    // Sort by most recent first
    workflowRuns.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Only show the 10 most recent
    const recentRuns = workflowRuns.slice(0, 10);

    recentRuns.forEach(run => {
        const card = document.createElement('div');
        card.className = 'card';

        // Get the right status badge class
        const statusClass =
            run.status === 'completed' && run.conclusion === 'success' ? 'badge-success' :
                run.status === 'completed' && run.conclusion === 'failure' ? 'badge-failure' :
                    'badge-pending';

        const statusText =
            run.status === 'completed' && run.conclusion === 'success' ? 'Success' :
                run.status === 'completed' && run.conclusion === 'failure' ? 'Failed' :
                    run.status === 'completed' && run.conclusion === 'cancelled' ? 'Cancelled' :
                        'Running';

        // Format the date
        const createdDate = new Date(run.created_at);
        const dateString = createdDate.toLocaleDateString();
        const timeString = createdDate.toLocaleTimeString();

        // Get PR number if applicable
        const prLink = run.pull_requests && run.pull_requests.length > 0
            ? `<a href="${run.pull_requests[0].url.replace('api.github.com/repos', 'github.com')}" target="_blank">PR #${run.pull_requests[0].number}</a>`
            : 'No linked PR';

        card.innerHTML = `
            <div class="card-header">
                <div class="card-title">
                    <a href="${run.html_url}" target="_blank">${escapeHtml(run.name || run.workflow_id)}</a>
                </div>
                <span class="badge ${statusClass}">${statusText}</span>
            </div>
            <div class="card-meta">
                Run on ${dateString} at ${timeString} • ${prLink}
            </div>
            <div class="card-content">
                Branch: ${escapeHtml(run.head_branch)} • 
                Commit: ${escapeHtml(run.head_commit?.message || 'Unknown commit')}
            </div>
        `;

        actionsContainer.appendChild(card);
    });
}

function showNotification(message, type = 'info') {
    notificationEl.textContent = message;
    notificationEl.className = `notification show ${type}`;

    setTimeout(() => {
        notificationEl.classList.remove('show');
    }, 3000);
}

// Helper functions
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substr(0, maxLength) + '...';
}
