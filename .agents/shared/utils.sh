#!/bin/bash

# Shared utilities for phase implementation scripts

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_color() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to print success message
print_success() {
    print_color "$GREEN" "✅ $1"
}

# Function to print error message
print_error() {
    print_color "$RED" "❌ $1"
}

# Function to print warning message
print_warning() {
    print_color "$YELLOW" "⚠️  $1"
}

# Function to print info message
print_info() {
    print_color "$BLUE" "ℹ️  $1"
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to ensure directory exists
ensure_dir() {
    local dir=$1
    if [ ! -d "$dir" ]; then
        mkdir -p "$dir"
    fi
}

# Function to backup a file
backup_file() {
    local file=$1
    if [ -f "$file" ]; then
        cp "$file" "${file}.backup.$(date +%Y%m%d_%H%M%S)"
    fi
}

# Function to count files matching pattern
count_files() {
    local pattern=$1
    local dir=${2:-.}
    find "$dir" -name "$pattern" -type f 2>/dev/null | wc -l | tr -d ' '
}

# Function to safely remove file
safe_remove() {
    local file=$1
    if [ -f "$file" ]; then
        rm -f "$file"
        return 0
    fi
    return 1
}

# Function to check step success
check_step() {
    local step_name=$1
    if [ $? -eq 0 ]; then
        print_success "$step_name - SUCCESS"
        return 0
    else
        print_error "$step_name - FAILED"
        echo "🛑 Aborting implementation..."
        exit 1
    fi
}

# Function to create report header
create_report_header() {
    local title=$1
    echo "# $title"
    echo "Generated: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
}

# Export functions for use in other scripts
export -f print_color
export -f print_success
export -f print_error
export -f print_warning
export -f print_info
export -f command_exists
export -f ensure_dir
export -f backup_file
export -f count_files
export -f safe_remove
export -f check_step
export -f create_report_header