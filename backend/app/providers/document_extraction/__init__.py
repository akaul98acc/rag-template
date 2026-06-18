CATALOG: dict[str, dict] = {
    "azure_di": {
        "name": "Azure Document Intelligence",
        "description": "Layout + key/value + tables. Strong on forms and scanned PDFs.",
        "pricing_notes": "Per-page; layout/prebuilt/custom tiers.",
        "requires_env": ["AZURE_DOCINTEL_ENDPOINT", "AZURE_DOCINTEL_KEY"],
        "requires_packages": ["azure-ai-documentintelligence"],
    },
    "aws_textract": {
        "name": "AWS Textract",
        "description": "OCR + tables + forms. Good AWS-native option.",
        "pricing_notes": "Per-page; tables/forms billed separately.",
        "requires_env": ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
        "requires_packages": ["boto3"],
    },
    "google_doc_ai": {
        "name": "Google Document AI",
        "description": "Processors for layout, forms, invoices, contracts.",
        "pricing_notes": "Per-page; varies by processor.",
        "requires_env": ["GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_DOCAI_PROCESSOR_NAME"],
        "requires_packages": ["google-cloud-documentai"],
    },
    "unstructured": {
        "name": "Unstructured.io",
        "description": "Open-source / hosted partitioning across many formats.",
        "pricing_notes": "Free self-host; hosted is per-page.",
        "requires_env": [],
        "requires_packages": ["unstructured"],
    },
}
