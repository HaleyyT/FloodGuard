"""Build a local ML-ready dataset from FloodGuard backend exports.

This script is intentionally a scaffold. It documents the expected direction
without pretending the project is ready for serious model training yet.
"""

from pathlib import Path


def main() -> None:
    output_dir = Path(__file__).resolve().parents[1] / "data"
    output_dir.mkdir(parents=True, exist_ok=True)
    print("Dataset builder scaffold ready.")
    print("Next step: pull feature rows from /api/features and persist curated CSV/parquet files.")


if __name__ == "__main__":
    main()
