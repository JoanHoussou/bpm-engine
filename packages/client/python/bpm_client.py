# BPM Engine - Python Client
# Pour intégration Flask / Django / FastAPI
#
# Usage:
#   from bpm_client import BpmClient
#
#   bpm = BpmClient("http://localhost:3000", "bpm_live_xxx")
#
#   # Exécuter un workflow
#   result = bpm.execute("demande_stage", {"user_id": 123})
#
#   # Approuver
#   bpm.approve(result["execution_id"])

import requests
from typing import Dict, Any, Optional, List


class BpmClientError(Exception):
    """Exception personnalisée pour les erreurs BPM"""
    def __init__(self, message: str, status_code: int = 0, trace_id: Optional[str] = None):
        self.message = message
        self.status_code = status_code
        self.trace_id = trace_id
        super().__init__(self.format_message())
    
    def format_message(self) -> str:
        if self.trace_id:
            return f"[{self.status_code}] {self.message} (trace: {self.trace_id})"
        return f"[{self.status_code}] {self.message}"


class BpmClient:
    """Client Python pour BPM Engine"""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout: int = 30
    ):
        """
        Initialiser le client BPM

        Args:
            base_url: URL du moteur BPM (ex: http://localhost:3000)
            api_key: Clé API
            timeout: Timeout en secondes
        """
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        })
    
    def _handle_error(self, response: requests.Response) -> None:
        """Gérer les erreurs HTTP et lever une exception détaillée"""
        if response.status_code >= 400:
            try:
                data = response.json()
                error_msg = data.get('error', data.get('message', 'Unknown error'))
                trace_id = data.get('trace_id')
                raise BpmClientError(error_msg, response.status_code, trace_id)
            except ValueError:
                raise BpmClientError(response.text, response.status_code)
    
    def get_schema(self, workflow_type: str) -> Dict[str, Any]:
        """
        Obtenir le schéma d'un workflow (champs requis, steps humains)
        
        Args:
            workflow_type: Type du workflow
            
        Returns:
            Dict avec required_payload_fields, human_steps, example_payload
        """
        response = self.session.get(
            f"{self.base_url}/api/v1/registry/{workflow_type}/schema",
            timeout=self.timeout
        )
        self._handle_error(response)
        return response.json()

    def execute(
        self,
        workflow_type: str,
        payload: Dict[str, Any],
        idempotency_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Exécuter un workflow

        Args:
            workflow_type: Type du workflow (défini dans le registre)
            payload: Données à passer au workflow
            idempotency_key: Clé pour éviter les doublons (optionnel)

        Returns:
            Dict avec execution_id, status, etc.
        """
        data = {
            "type": workflow_type,
            "payload": payload
        }
        if idempotency_key:
            data["idempotency_key"] = idempotency_key

        response = self.session.post(
            f"{self.base_url}/api/v1/workflow/execute",
            json=data,
            timeout=self.timeout
        )
        self._handle_error(response)
        return response.json()

    def approve(self, execution_id: str, comment: Optional[str] = None) -> Dict[str, Any]:
        """
        Approuver une étape humaine
        """
        return self.resume(execution_id, "approved", comment)

    def reject(self, execution_id: str, comment: Optional[str] = None) -> Dict[str, Any]:
        """
        Rejeter une étape humaine
        """
        return self.resume(execution_id, "rejected", comment)

    def resume(
        self,
        execution_id: str,
        decision: str,
        comment: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Reprendre un workflow après une décision humaine
        """
        data = {"decision": decision}
        if comment:
            data["comment"] = comment

        response = self.session.post(
            f"{self.base_url}/api/v1/workflow/{execution_id}/resume",
            json=data,
            timeout=self.timeout
        )
        self._handle_error(response)
        return response.json()

    def get_status(self, execution_id: str) -> Dict[str, Any]:
        """
        Obtenir le statut d'une exécution
        """
        response = self.session.get(
            f"{self.base_url}/api/v1/workflow/{execution_id}",
            timeout=self.timeout
        )
        self._handle_error(response)
        return response.json()

    def cancel(self, execution_id: str) -> Dict[str, Any]:
        """
        Annuler une exécution
        """
        response = self.session.post(
            f"{self.base_url}/api/v1/workflow/{execution_id}/cancel",
            json={},
            timeout=self.timeout
        )
        self._handle_error(response)
        return response.json()

    def list_workflows(self) -> Dict[str, Any]:
        """
        Lister les workflows disponibles
        """
        response = self.session.get(
            f"{self.base_url}/api/v1/registry",
            timeout=self.timeout
        )
        self._handle_error(response)
        return response.json()
