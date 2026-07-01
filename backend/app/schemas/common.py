from typing import Any

from pydantic import BaseModel, ConfigDict


class APIError(BaseModel):
    status: str = "error"
    code: str
    message: str


class APISuccess(BaseModel):
    status: str = "success"
    data: Any
    meta: dict[str, Any] | None = None


class ORMBaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
