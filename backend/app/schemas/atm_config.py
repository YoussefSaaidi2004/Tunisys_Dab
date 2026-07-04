from pydantic import BaseModel


class SSHConfigUpdate(BaseModel):
    ssh_login: str
    ssh_password: str
    ssh_port: int | None = None