#!/bin/bash
DEFAULT_TARGET="ding.js"

# Check if an argument (process name or PID) is provided
if [ -z "$1" ]; then
    TARGET="$DEFAULT_TARGET"
else
    TARGET="$1"
fi

MYPID=$$;

# Try to interpret the argument as a PID
if [[ "$TARGET" =~ ^[0-9]+$ ]]; then
  echo "Killing process with PID: $TARGET"
  if kill "$TARGET" 2>/dev/null; then
    echo "Process with PID $TARGET killed successfully."
  else
    echo "Failed to kill process with PID $TARGET. It might not exist or you may lack permissions."
    exit 2
  fi
else
  # Handle the argument as a process name
  echo "Looking for processes with name: $TARGET"
  PIDS=$(pgrep -f "$TARGET")
  PIDS=$(echo "$PIDS" | grep -v "$MYPID")

  if [ -z "$PIDS" ]; then
    echo "No processes found with name: $TARGET"
    exit 3
  fi

  echo "Found process(es): $PIDS"
  for PID in $PIDS; do
    if [ "$PID" == "$MYPID" ]; then
      continue
    fi
    echo "Killing PID $PID..."
    if kill "$PID" 2>/dev/null; then
      echo "Successfully killed PID $PID."
    else
      echo "Failed to kill PID $PID. It might no longer exist or you may lack permissions."
    fi
  done
fi