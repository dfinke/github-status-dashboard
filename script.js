// Constants
const REFRESH_INTERVAL = 15000; // 15 seconds

// State variables
let refreshIntervalId = null;
let repositories = []; // Changed from single repository to array
let selectedRepositories = []; // Track which repositories are selected for viewing
let token = '';

// DOM Elements
const repoInput = document.getElementById('repo-input');
const addRepoBtn = document.getElementById('add-repo');
const tokenInput = document.getElementById('token-input');
const saveSettingsBtn = document.getElementById('save-settings');
const refreshNowBtn = document.getElementById('refresh-now');
const repoList = document.getElementById('repo-list');
const repoItems = document.getElementById('repo-items');
const repoControls = document.getElementById('repo-controls');
const selectAllReposBtn = document.getElementById('select-all-repos');
const selectNoneReposBtn = document.getElementById('select-none-repos');
const prContainer = document.getElementById('pr-container');
const actionsContainer = document.getElementById('actions-container');
const lastRefreshEl = document.getElementById('last-refresh');
const refreshStatusEl = document.getElementById('refresh-status');
const notificationEl = document.getElementById('notification');

// Event Listeners
document.addEventListener('DOMContentLoaded', initialize);
addRepoBtn.addEventListener('click', addRepository);
repoInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addRepository();
    }
});
saveSettingsBtn.addEventListener('click', saveSettings);
refreshNowBtn.addEventListener('click', refreshData);
selectAllReposBtn.addEventListener('click', selectAllRepositories);
selectNoneReposBtn.addEventListener('click', selectNoneRepositories);

// Functions
function initialize() {
    // Load settings from localStorage if available
    const savedRepos = localStorage.getItem('github-dashboard-repos');
    const savedToken = localStorage.getItem('github-dashboard-token');

    if (savedRepos) {
        try {
            repositories = JSON.parse(savedRepos);
        } catch (e) {
            // Handle legacy single repo format
            const legacyRepo = localStorage.getItem('github-dashboard-repo');
            if (legacyRepo) {
                repositories = [legacyRepo];
            }
        }
    }
    
    if (savedToken) tokenInput.value = savedToken;

    // Initialize selected repositories - default to all if not saved
    const savedSelectedRepos = localStorage.getItem('github-dashboard-selected-repos');
    if (savedSelectedRepos) {
        try {
            selectedRepositories = JSON.parse(savedSelectedRepos);
            // Ensure selected repos are still in the repositories list
            selectedRepositories = selectedRepositories.filter(repo => repositories.includes(repo));
        } catch (e) {
            selectedRepositories = [...repositories]; // Default to all selected
        }
    } else {
        selectedRepositories = [...repositories]; // Default to all selected
    }

    updateRepoDisplay();

    if (repositories.length > 0 && savedToken) {
        token = savedToken;
        startAutoRefresh();
        refreshData();
    }
}

function addRepository() {
    const repo = repoInput.value.trim();
    
    if (!repo) {
        showNotification('Please enter a repository name', 'error');
        return;
    }

    // Validate repository format
    if (!repo.includes('/')) {
        showNotification('Repository should be in format "owner/repo"', 'error');
        return;
    }

    // Check if repository already exists
    if (repositories.includes(repo)) {
        showNotification('Repository already added', 'error');
        return;
    }

    repositories.push(repo);
    selectedRepositories.push(repo); // Auto-select new repositories
    repoInput.value = '';
    updateRepoDisplay();
    showNotification('Repository added!', 'success');
}

function removeRepository(repo) {
    repositories = repositories.filter(r => r !== repo);
    selectedRepositories = selectedRepositories.filter(r => r !== repo);
    updateRepoDisplay();
    showNotification('Repository removed!', 'success');
}

function updateRepoDisplay() {
    if (repositories.length === 0) {
        repoItems.innerHTML = '<div class="no-repos">No repositories added yet.</div>';
        repoControls.style.display = 'none';
        return;
    }

    // Show control buttons when there are multiple repositories
    repoControls.style.display = repositories.length > 1 ? 'flex' : 'none';

    repoItems.innerHTML = repositories.map(repo => `
        <div class="repo-item">
            <label class="repo-checkbox-label">
                <input type="checkbox" class="repo-checkbox" data-repo="${escapeHtml(repo)}" 
                       ${selectedRepositories.includes(repo) ? 'checked' : ''}>
                <span class="repo-name">${escapeHtml(repo)}</span>
            </label>
            <button type="button" class="remove-repo" data-repo="${escapeHtml(repo)}" title="Remove repository">×</button>
        </div>
    `).join('');
    
    // Add event listeners to remove buttons
    repoItems.querySelectorAll('.remove-repo').forEach(btn => {
        btn.addEventListener('click', function() {
            removeRepository(this.dataset.repo);
        });
    });

    // Add event listeners to checkboxes
    repoItems.querySelectorAll('.repo-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            toggleRepositorySelection(this.dataset.repo, this.checked);
        });
    });
}

function toggleRepositorySelection(repo, isSelected) {
    if (isSelected) {
        if (!selectedRepositories.includes(repo)) {
            selectedRepositories.push(repo);
        }
    } else {
        selectedRepositories = selectedRepositories.filter(r => r !== repo);
    }
    
    // Refresh displays to show filtered data
    if (repositories.length > 0 && token) {
        refreshData();
    }
}

function selectAllRepositories() {
    selectedRepositories = [...repositories];
    updateRepoDisplay();
    if (repositories.length > 0 && token) {
        refreshData();
    }
}

function selectNoneRepositories() {
    selectedRepositories = [];
    updateRepoDisplay();
    if (repositories.length > 0 && token) {
        refreshData();
    }
}

function saveSettings() {
    token = tokenInput.value.trim();

    if (repositories.length === 0 || !token) {
        showNotification('Please add at least one repository and enter a token', 'error');
        return;
    }

    // Save to localStorage
    localStorage.setItem('github-dashboard-repos', JSON.stringify(repositories));
    localStorage.setItem('github-dashboard-selected-repos', JSON.stringify(selectedRepositories));
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
    if (repositories.length === 0 || !token) {
        showNotification('Please configure repositories and token first', 'error');
        return;
    }

    updateLastRefreshTime();

    try {
        await Promise.all([
            fetchAllPullRequests(),
            fetchAllWorkflowRuns()
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

async function fetchAllPullRequests() {
    prContainer.innerHTML = '<div class="loading">Loading pull requests...</div>';

    try {
        const allPullRequests = [];
        
        for (const repo of repositories) {
            try {
                const response = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
                    headers: {
                        'Authorization': `token ${token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });

                if (!response.ok) {
                    console.error(`Failed to fetch PRs for ${repo}: ${response.status}`);
                    continue;
                }

                const pullRequests = await response.json();
                // Add repository info to each PR
                pullRequests.forEach(pr => {
                    pr.repository = repo;
                });
                allPullRequests.push(...pullRequests);
            } catch (error) {
                console.error(`Error fetching PRs for ${repo}:`, error);
            }
        }

        if (allPullRequests.length === 0) {
            prContainer.innerHTML = '<div class="error">No pull requests found.</div>';
            return;
        }

        // Sort by creation date, newest first
        allPullRequests.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        displayPullRequests(allPullRequests);
    } catch (error) {
        console.error('Error fetching pull requests:', error);
        prContainer.innerHTML = `<div class="error">Error loading pull requests: ${error.message}</div>`;
    }
}

async function fetchAllWorkflowRuns() {
    actionsContainer.innerHTML = '<div class="loading">Loading workflow runs...</div>';

    try {
        const allWorkflowRuns = [];
        
        for (const repo of repositories) {
            try {
                const response = await fetch(`https://api.github.com/repos/${repo}/actions/runs`, {
                    headers: {
                        'Authorization': `token ${token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });

                if (!response.ok) {
                    console.error(`Failed to fetch workflow runs for ${repo}: ${response.status}`);
                    continue;
                }

                const data = await response.json();
                const workflowRuns = data.workflow_runs || [];
                // Add repository info to each workflow run
                workflowRuns.forEach(run => {
                    run.repository = repo;
                });
                allWorkflowRuns.push(...workflowRuns);
            } catch (error) {
                console.error(`Error fetching workflow runs for ${repo}:`, error);
            }
        }

        if (allWorkflowRuns.length === 0) {
            actionsContainer.innerHTML = '<div class="error">No workflow runs found.</div>';
            return;
        }

        displayWorkflowRuns(allWorkflowRuns);
    } catch (error) {
        console.error('Error fetching workflow runs:', error);
        actionsContainer.innerHTML = `<div class="error">Error loading workflow runs: ${error.message}</div>`;
    }
}

// Keep legacy functions for backward compatibility, but they now work with the first repository
async function fetchPullRequests() {
    if (repositories.length === 0) return;
    return fetchAllPullRequests();
}

async function fetchWorkflowRuns() {
    if (repositories.length === 0) return;
    return fetchAllWorkflowRuns();
}

function displayPullRequests(pullRequests) {
    prContainer.innerHTML = '';

    // Filter pull requests based on selected repositories
    const filteredPRs = pullRequests.filter(pr => 
        selectedRepositories.length === 0 || selectedRepositories.includes(pr.repository)
    );

    if (filteredPRs.length === 0) {
        prContainer.innerHTML = '<div class="error">No pull requests found for selected repositories.</div>';
        return;
    }

    filteredPRs.forEach(pr => {
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

        // Repository label (only show if multiple repos)
        const repoLabel = repositories.length > 1 && pr.repository ? 
            `<div class="card-repo">${escapeHtml(pr.repository)}</div>` : '';

        card.innerHTML = `
            ${repoLabel}
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

    // Filter workflow runs based on selected repositories
    const filteredRuns = workflowRuns.filter(run => 
        selectedRepositories.length === 0 || selectedRepositories.includes(run.repository)
    );

    if (filteredRuns.length === 0) {
        actionsContainer.innerHTML = '<div class="error">No workflow runs found for selected repositories.</div>';
        return;
    }

    // Sort by most recent first
    filteredRuns.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Only show the 10 most recent
    const recentRuns = filteredRuns.slice(0, 10);

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

        // Repository label (only show if multiple repos)
        const repoLabel = repositories.length > 1 && run.repository ? 
            `<div class="card-repo">${escapeHtml(run.repository)}</div>` : '';

        card.innerHTML = `
            ${repoLabel}
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
