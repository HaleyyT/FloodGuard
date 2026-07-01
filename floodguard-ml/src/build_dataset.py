"""Build a local ML-ready dataset from FloodGuard backend exports.

This script is intentionally lightweight for now.
Run `npm run export:ml-dataset` in `floodguard-frontend` first, then use the
generated CSV or JSON here for Python-side cleaning and training.
"""

from pathlib import Path


def main() -> None:
    output_dir = Path(__file__).resolve().parents[1] / "data"
    output_dir.mkdir(parents=True, exist_ok=True)
    print("Dataset builder scaffold ready.")
    print("Expected inputs:")
    print(f"- {output_dir / 'floodguard_features.csv'}")
    print(f"- {output_dir / 'floodguard_features.json'}")
    print("Next step: load the exported dataset, clean it in Python, and prepare model splits.")


if __name__ == "__main__":
    main()
