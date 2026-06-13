# Check for venv
$pythonPath = "python"
if (Test-Path ".venv/Scripts/python.exe") {
    $pythonPath = ".\.venv\Scripts\python.exe"
    Write-Host "Using virtual environment python: $pythonPath"
}

# Install dependencies
Write-Host "Installing dependencies..."
& $pythonPath -m pip install -r backend/requirements.txt

# Start Backend
Write-Host "Starting Backend Server..."
# Start a new PowerShell window that stays open (-NoExit) so we can see any errors
Start-Process powershell -ArgumentList "-NoExit", "-Command", "& '$pythonPath' backend/server.py"

# Wait a moment for the server to initialize
Start-Sleep -Seconds 3

# Open Frontend
Write-Host "Opening Frontend..."
Start-Process "frontend/index.html"

Write-Host "Project is running. The backend server is in the new PowerShell window."
