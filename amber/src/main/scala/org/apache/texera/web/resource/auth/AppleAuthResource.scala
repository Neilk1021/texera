/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

package org.apache.texera.web.resource.auth

import org.apache.texera.common.config.UserSystemConfig
import org.apache.texera.web.model.http.response.TokenIssueResponse

import javax.ws.rs.core.MediaType
import javax.ws.rs.{Consumes, GET, POST, Path, Produces}

@Path("/auth/apple")
class AppleAuthResource {
  //TODO test with real apple client id and set that.
  final private lazy val clientId = UserSystemConfig.appleClientId

  @GET
  @Path("/clientid")
  def getClientId: String = clientId

  @POST
  @Consumes(Array(MediaType.TEXT_PLAIN))
  @Produces(Array(MediaType.APPLICATION_JSON))
  @Path("/login")
  def login(crediential: String): TokenIssueResponse = {

  }
}
