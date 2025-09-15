#!/bin/bash

echo "Setting up Python translation service..."

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed"
    exit 1
fi

# Check Python version
python_version=$(python3 --version 2>&1 | awk '{print $2}')
echo "Python version: $python_version"

# Install pip if not present
if ! command -v pip3 &> /dev/null; then
    echo "Installing pip..."
    python3 -m ensurepip --default-pip
fi

# Install required Python packages
echo "Installing Python dependencies..."
pip3 install -r requirements.txt

echo "Python translation service setup complete!"
echo "Note: Make sure to set your OpenAI API key in the environment or pass it as needed."