import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, shareReplay, throwError } from 'rxjs';

import { BenchmarkMetadata, Run, RunValues, SparqlEntry } from '../models/benchmark.models';

@Injectable({ providedIn: 'root' })
export class BenchmarkApi {
  private readonly http = inject(HttpClient);
  private readonly runMetadataCache = new Map<string, Observable<BenchmarkMetadata>>();
  private readonly benchmarkMetadataCache = new Map<string, Observable<BenchmarkMetadata>>();

  runs(refresh = false): Observable<{ items: Run[]; count: number }> {
    const params = refresh ? new HttpParams().set('refresh', true) : undefined;
    return this.http.get<{ items: Run[]; count: number }>('/api/runs', { params });
  }

  runValues(runId: string): Observable<RunValues> {
    return this.http.get<RunValues>('/api/run-values', {
      params: new HttpParams().set('run_id', runId),
    });
  }

  runMetadata(runId: string): Observable<BenchmarkMetadata> {
    const cached = this.runMetadataCache.get(runId);
    if (cached) return cached;

    const request = this.http
      .get<BenchmarkMetadata>('/api/run-metadata', {
        params: new HttpParams().set('run_id', runId),
      })
      .pipe(
        shareReplay(1),
        catchError((error) => {
          this.runMetadataCache.delete(runId);
          return throwError(() => error);
        }),
      );
    this.runMetadataCache.set(runId, request);
    return request;
  }

  benchmarkMetadata(benchmarkUrl: string): Observable<BenchmarkMetadata> {
    const cached = this.benchmarkMetadataCache.get(benchmarkUrl);
    if (cached) return cached;

    const request = this.http
      .get<BenchmarkMetadata>('/api/benchmark-metadata', {
        params: new HttpParams().set('benchmark_url', benchmarkUrl),
      })
      .pipe(
        shareReplay(1),
        catchError((error) => {
          this.benchmarkMetadataCache.delete(benchmarkUrl);
          return throwError(() => error);
        }),
      );
    this.benchmarkMetadataCache.set(benchmarkUrl, request);
    return request;
  }

  sparqlLog(): Observable<{ items: SparqlEntry[]; count: number }> {
    return this.http.get<{ items: SparqlEntry[]; count: number }>('/api/sparql-log');
  }

  clearSparqlLog(): Observable<void> {
    return this.http.delete<void>('/api/sparql-log');
  }
}
