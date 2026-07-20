"""Phase-2 training script for the AI Learning pipeline — NOT imported by
the running API. The dataset (AIDecisionEvent, via dataset_builder) is
already being collected automatically from real approvals; this script
trains a Random Forest classifier to predict `is_override` (will the
planner follow the AHP top pick or not) once enough decisions exist.

Run manually once there is real usage data:
    venv/Scripts/python.exe -m app.tdss.ai.train_model
"""

from app.database import SessionLocal
from app.tdss.ai.dataset_builder import build_dataset_rows

MIN_ROWS_TO_TRAIN = 50


def main() -> None:
    db = SessionLocal()
    try:
        rows = build_dataset_rows(db)
    finally:
        db.close()

    print(f"Collected {len(rows)} decision events.")
    if len(rows) < MIN_ROWS_TO_TRAIN:
        print(
            f"Not enough data to train yet (need >= {MIN_ROWS_TO_TRAIN} rows). "
            "The pipeline and dataset are ready — re-run this script later "
            "once more approvals have been recorded through normal use."
        )
        return

    import joblib
    import pandas as pd
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.metrics import accuracy_score, classification_report
    from sklearn.model_selection import train_test_split

    df = pd.DataFrame(rows)
    feature_cols = [c for c in df.columns if c.startswith("weight_") or c.startswith("selected_")]
    df = df.dropna(subset=feature_cols)
    X = df[feature_cols]
    y = df["is_override"].astype(int)

    stratify = y if y.nunique() > 1 else None
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=stratify)

    model = RandomForestClassifier(n_estimators=200, random_state=42)
    model.fit(X_train, y_train)
    preds = model.predict(X_test)

    print("Accuracy:", accuracy_score(y_test, preds))
    print(classification_report(y_test, preds))

    joblib.dump(model, "ai_override_model.joblib")
    print("Model saved to ai_override_model.joblib")


if __name__ == "__main__":
    main()
