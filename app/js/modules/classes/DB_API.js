// modules/classes/DB_API.js
// Migración de IndexedDB a MySQL vía PHP
// Este archivo usa fetch contra el endpoint DB.php

import { modalAppointmentStateInput, modalMedicoInput } from "../selectores.js";
import { reloadPage, goToControlPage } from "../funciones.js";
import Alert from "../components/Alert.js";

class DB {
  baseUrl = 'https://app.hsdental.es/api/DB.php';

  /**
   * Obtiene todas las visitas de un cliente específico
   * @param {number} clientId - ID del cliente
   * @returns {Promise<Array>} Array de visitas del cliente
   */
  async getVisitsByClientId(clientId) {
    try {
      const response = await fetch(`${this.baseUrl}?table=visits&client_id=${clientId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error('Error fetching visits by client ID:', error);
      return [];
    }
  }

  /**
   * Obtiene una visita específica por su ID
   * @param {number} visitId - ID de la visita
   * @returns {Promise<Object|null>} Datos de la visita o null
   */
  static async getVisit(visitId) {
    try {
      const response = await fetch(`${this.baseUrl}?table=visits&id=${visitId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      return data.data || null;
    } catch (error) {
      console.error('Error fetching visit:', error);
      return null;
    }
  }

  async uploadFile(table, formData) {
    const url = `${this.baseUrl}?table=${table}`;
    const res = await fetch(url, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(`Error al subir archivo a ${table}: ${errorData.error || errorData.message}`);
    }
    return res.json();
  }

  async getRecords(table) {
    const url = `${this.baseUrl}?table=${table}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`Error al obtener datos de ${table}`);
    const data = await res.json();
    return this._normalizeDatesArray(data);
  }

  async getRecordsP(table, id = null) {
    let url = `${this.baseUrl}?table=${table}`;
    if (table === 'payments' && id) url += `&treatment_id=${id}`;
    if (table === 'images' && id) url += `&tratamiento_id=${id}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`Error al obtener datos de ${table}`);
    const data = await res.json();
    return this._normalizeDatesArray(data);
  }

  async getRecord(table, id) {
    const url = `${this.baseUrl}?table=${table}&id=${id}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`Error obteniendo ${table} id=${id}`);
    const record = await res.json();
    if (!record || Object.keys(record).length === 0) throw new Error(`No se encontró ${table} con id=${id}`);
    if (record.fecha) record.fecha = record.fecha.replace(' ', 'T').slice(0, 16);
    return record;
  }

  async addRegister(table, payload) {
    const url = `${this.baseUrl}?table=${table}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      if (!res.ok) throw new Error(data.error || JSON.stringify(data));
      return data;
    } catch {
      throw new Error(text);
    }
  }

  async editRecord(table, id, payload) {
    const url = `${this.baseUrl}?table=${table}&id=${id}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      if (!res.ok) throw new Error(data.error || JSON.stringify(data));
      return data;
    } catch {
      throw new Error(text);
    }
  }

  async deleteRecord(table, id) {
    const url = `${this.baseUrl}?table=${table}&id=${id}`;
    const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
    if (!res.ok) throw new Error(`Error eliminando ${table} id=${id}`);
    return await res.json();
  }

  async getMonthlyAppointments([start, end]) {
    const params = new URLSearchParams({ table: 'appointments', start, end });
    const res = await fetch(`${this.baseUrl}?${params}`, { credentials: 'include' });
    if (!res.ok) throw new Error('Error al obtener citas mensuales');
    const data = await res.json();
    return this._normalizeDatesArray(data);
  }

  async updateState(id) {
    const estado = modalAppointmentStateInput.value;
    try {
      await this.editRecord('appointments', id, { estado });
      Alert.showStatusAlert('success', '¡Listo!', 'Estado actualizado correctamente', reloadPage);
    } catch (err) {
      Alert.showStatusAlert('error', '¡Error!', err.message, reloadPage);
    }
  }

  async updateMedico(id) {
    const medico = modalMedicoInput.value;
    try {
      await this.editRecord('appointments', id, { medico });
      Alert.showStatusAlert('success', '¡Listo!', 'Médico actualizado correctamente', goToControlPage);
    } catch (err) {
      Alert.showStatusAlert('error', '¡Error!', err.message, reloadPage);
    }
  }

  async getTreatmentsByClientId(clientId) {
    const params = new URLSearchParams({ table: 'treatments', client_id: clientId });
    const url = `${this.baseUrl}?${params}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`Error al obtener tratamientos para el cliente ${clientId}`);
    const data = await res.json();
    return this._normalizeDatesArray(data);
  }

  async getPiecesByTreatmentId(treatmentId) {
    const params = new URLSearchParams({ table: 'pieces', treatment_id: treatmentId });
    const url = `${this.baseUrl}?${params}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`Error al obtener piezas para el tratamiento ${treatmentId}`);
    const data = await res.json();
    return this._normalizeDatesArray(data);
  }

  async createPiece(pieceData) {
    return this.addRegister('pieces', pieceData);
  }

  async getPaymentsByTreatmentId(treatmentId) {
    return this.getRecordsP('payments', treatmentId);
  }

  _normalizeDatesArray(array) {
    return array.map(rec => this._normalizeDateRecord(rec));
  }

  _normalizeDateRecord(record) {
    if (record && record.fecha) {
      record.fecha = record.fecha.replace(' ', 'T').slice(0, 16);
    }
    return record;
  }
}

export default new DB();
